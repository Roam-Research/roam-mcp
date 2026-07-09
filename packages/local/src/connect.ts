import { search, select, input } from "@inquirer/prompts";
import {
  getPort,
  getConfiguredGraphsSafe,
  saveGraphToConfig,
  removeGraphFromConfig,
} from "./graph-resolver.js";
import { fetchAvailableGraphs, requestToken, sleep, openRoamApp, slugify } from "./roam-api.js";
import type { GraphConfig, GraphType, AccessLevel } from "@roam-research/roam-tools-core";
import type { AvailableGraph, GraphsResponse, TokenExchangeResponse } from "./roam-api.js";

// ============================================================================
// Types
// ============================================================================

interface GraphChoice extends AvailableGraph {
  isOpen: boolean;
  isConnected: boolean;
  existingNickname?: string;
  isCustomOption?: boolean;
  isPublicGraph?: boolean;
  lastKnownTokenStatus?: string;
}

// These options must stay in sync with the Commander options in packages/cli/src/index.ts
// and the manual arg parsing in packages/mcp/src/index.ts.
export interface ConnectOptions {
  graph?: string;
  nickname?: string;
  accessLevel?: string;
  public?: boolean;
  type?: string;
  remove?: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchOpenGraphs(port: number): Promise<AvailableGraph[]> {
  const url = `http://127.0.0.1:${port}/api/graphs/open`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await response.json()) as GraphsResponse;

  if (!data.success) {
    // Open graphs failing is not critical, return empty
    return [];
  }

  return data.result || [];
}

// ============================================================================
// Helpers
// ============================================================================

function getErrorMessage(error: TokenExchangeResponse["error"]): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.message || "Unknown error";
}

function getErrorCode(error: TokenExchangeResponse["error"]): string | undefined {
  if (!error || typeof error === "string") return undefined;
  return error.code;
}

// ============================================================================
// Main Connect Function
// ============================================================================

export async function connect(options: ConnectOptions = {}): Promise<void> {
  // Deliberately omits "read-edit-own": it is a real AccessLevel (accepted by
  // GraphConfigSchema, and written here from the backend's grantedAccessLevel
  // below) but is enforced server-side by the hosted MCP only, so there is no
  // point letting a local user *request* it. Not an oversight — don't "fix".
  const VALID_ACCESS_LEVELS = ["full", "read-append", "read-only"];
  const VALID_TYPES = ["hosted", "offline"];

  // ── Handle --remove mode ──────────────────────────────────────────────
  if (options.remove) {
    if (!options.graph && !options.nickname) {
      console.error("Error: --remove requires --graph <name> or --nickname <slug>.");
      process.exit(1);
    }

    const configuredGraphs = await getConfiguredGraphsSafe();
    let target: GraphConfig | undefined;

    if (options.nickname) {
      const slug = slugify(options.nickname);
      target = configuredGraphs.find((g) => g.nickname.toLowerCase() === slug.toLowerCase());
    } else if (options.graph) {
      target = configuredGraphs.find((g) => g.name === options.graph);
    }

    if (!target) {
      console.error(
        `Error: No configured graph found matching ${options.nickname ? `nickname "${slugify(options.nickname)}"` : `name "${options.graph}"`}.`,
      );
      if (configuredGraphs.length > 0) {
        console.error("\nConfigured graphs:");
        for (const g of configuredGraphs) {
          console.error(`  - ${g.nickname} (${g.name})`);
        }
      }
      process.exit(1);
    }

    await removeGraphFromConfig(target.nickname);
    console.log(`Removed "${target.nickname}" (${target.name}) from config.`);
    return;
  }

  // ── Non-interactive mode detection ────────────────────────────────────
  const nonInteractive = !!options.graph;

  // ── Validate flags (non-interactive) ──────────────────────────────────
  if (nonInteractive) {
    if (options.accessLevel && !VALID_ACCESS_LEVELS.includes(options.accessLevel)) {
      console.error(
        `Error: Invalid access level "${options.accessLevel}". Valid options: ${VALID_ACCESS_LEVELS.join(", ")}`,
      );
      process.exit(1);
    }

    if (options.type && !VALID_TYPES.includes(options.type)) {
      console.error(
        `Error: Invalid type "${options.type}". Valid options: ${VALID_TYPES.join(", ")}`,
      );
      process.exit(1);
    }

    if (options.public && options.type && options.type !== "hosted") {
      console.error(`Error: Public graphs are always hosted. Remove --type or set it to "hosted".`);
      process.exit(1);
    }

    if (options.public && options.accessLevel && options.accessLevel !== "read-only") {
      console.error(
        `Error: Public graphs only support read-only access. Remove --access-level or set it to "read-only".`,
      );
      process.exit(1);
    }

    if (!options.nickname) {
      console.error("Error: --nickname is required when using --graph.");
      console.error(
        'Provide a short name you\'ll use to refer to this graph, e.g. --nickname "my work graph"',
      );
      process.exit(1);
    }

    if (!slugify(options.nickname)) {
      console.error("Error: Nickname cannot be empty.");
      process.exit(1);
    }
  }

  let port: number;

  // 1. Get port and try to connect
  try {
    port = await getPort();
  } catch {
    port = 3333; // Default port
  }

  // 2. Fetch available graphs (with retry if Roam not running)
  let availableGraphs: AvailableGraph[];
  try {
    availableGraphs = await fetchAvailableGraphs(port);
  } catch (error) {
    const err = error as Error & { cause?: { code?: string } };
    if (err.cause?.code === "ECONNREFUSED" || err.message.includes("fetch failed")) {
      console.log("Roam Desktop is not running. Opening...");
      await openRoamApp();
      console.log("Waiting for Roam to start...");
      await sleep(5000);

      // Retry
      try {
        availableGraphs = await fetchAvailableGraphs(port);
      } catch {
        console.error("\nCould not connect to Roam Desktop.");
        console.error("Please make sure Roam is running and try again.");
        process.exit(1);
      }
    } else {
      throw error;
    }
  }

  if (availableGraphs.length === 0 && !options.public) {
    console.error("No graphs available. Please log in to Roam and try again.");
    process.exit(1);
  }

  // 3. Fetch open graphs (for highlighting)
  const openGraphs = await fetchOpenGraphs(port);

  // 4. Get currently configured graphs
  const configuredGraphs = await getConfiguredGraphsSafe();

  // 5a. Validate nickname collision early (non-interactive only)
  if (nonInteractive) {
    const nicknameSlug = slugify(options.nickname!);
    const graphType = options.type as GraphType | undefined;
    const existing = configuredGraphs.find(
      (g) =>
        g.nickname === nicknameSlug &&
        !(g.name === options.graph && (!graphType || g.type === graphType)),
    );
    if (existing) {
      console.error(
        `Error: Nickname "${nicknameSlug}" is already used by graph "${existing.name}".`,
      );
      console.error("Please choose a different nickname with --nickname.");
      process.exit(1);
    }
  }

  // 5b. Resolve selected graph
  let finalSelectedGraph: GraphChoice;

  if (nonInteractive) {
    // ── Non-interactive graph resolution ─────────────────────────────────
    if (options.public) {
      // Public graph: skip available graphs lookup, construct directly
      const graphType: GraphType = (options.type as GraphType) || "hosted";
      const configured = configuredGraphs.find(
        (c) => c.name === options.graph && c.type === graphType,
      );
      finalSelectedGraph = {
        name: options.graph!,
        type: graphType,
        isOpen: false,
        isConnected: !!configured,
        existingNickname: configured?.nickname,
        isPublicGraph: true,
      };
    } else {
      // Match against available graphs
      const graphType = options.type as GraphType | undefined;
      const match = availableGraphs.find(
        (g) => g.name === options.graph && (!graphType || g.type === graphType),
      );

      if (!match) {
        console.error(`Error: Graph "${options.graph}" not found in available graphs.`);
        if (availableGraphs.length > 0) {
          console.error("\nAvailable graphs:");
          for (const g of availableGraphs) {
            console.error(`  - ${g.name} (${g.type})`);
          }
        }
        console.error("\nIf this is a public graph, use --public.");
        process.exit(1);
      }

      const configured = configuredGraphs.find(
        (c) => c.name === match.name && c.type === match.type,
      );
      finalSelectedGraph = {
        ...match,
        isOpen: openGraphs.some((o) => o.name === match.name && o.type === match.type),
        isConnected: !!configured,
        existingNickname: configured?.nickname,
        lastKnownTokenStatus: configured?.lastKnownTokenStatus,
      };
    }
  } else {
    // ── Interactive graph selection ──────────────────────────────────────
    const choices: GraphChoice[] = availableGraphs.map((g) => {
      const isOpen = openGraphs.some((o) => o.name === g.name && o.type === g.type);
      const configured = configuredGraphs.find((c) => c.name === g.name && c.type === g.type);
      return {
        ...g,
        isOpen,
        isConnected: !!configured,
        existingNickname: configured?.nickname,
        lastKnownTokenStatus: configured?.lastKnownTokenStatus,
      };
    });

    // Add configured graphs that aren't in available list (e.g., public graphs)
    for (const configured of configuredGraphs) {
      const alreadyInList = choices.some(
        (c) => c.name === configured.name && c.type === configured.type,
      );
      if (!alreadyInList) {
        choices.push({
          name: configured.name,
          type: configured.type,
          isOpen: false,
          isConnected: true,
          existingNickname: configured.nickname,
          isPublicGraph: true,
          lastKnownTokenStatus: configured.lastKnownTokenStatus,
        });
      }
    }

    // Sort: open first, then by name
    choices.sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Add "Enter custom graph name" option at the end
    const customOption: GraphChoice = {
      name: "__custom__",
      type: "hosted",
      isOpen: false,
      isConnected: false,
      isCustomOption: true,
    };
    choices.push(customOption);

    // Interactive graph selection with search
    const selectedGraph = await search<GraphChoice>({
      message: "Select a graph to connect (or type to search):",
      source: async (input) => {
        // Filter available graphs (exclude custom option placeholder)
        const filtered = input
          ? choices.filter(
              (g) => !g.isCustomOption && g.name.toLowerCase().includes(input.toLowerCase()),
            )
          : choices.filter((g) => !g.isCustomOption);

        // Build results with custom option
        const results = filtered.map((g) => {
          let label = `${g.name} (${g.type})`;
          if (g.isOpen) label += " [open]";
          if (g.isPublicGraph && g.isConnected) {
            label += ` [public, connected as "${g.existingNickname}"${g.lastKnownTokenStatus === "revoked" ? ", token revoked" : ""}]`;
          } else if (g.isConnected) {
            label += ` [connected as "${g.existingNickname}"${g.lastKnownTokenStatus === "revoked" ? ", token revoked" : ""}]`;
          }
          return {
            name: label,
            value: g,
          };
        });

        // Always show custom option at the end, with search term as hint
        const customLabel = input
          ? `── Connect to public graph "${input}"`
          : "── Connect to a public graph...";
        results.push({
          name: customLabel,
          value: { ...customOption, name: input || "__custom__" },
        });

        return results;
      },
    });

    // Handle custom graph name option
    if (selectedGraph.isCustomOption) {
      // Use the search term as default if provided
      const defaultName = selectedGraph.name !== "__custom__" ? selectedGraph.name : "";
      const customName = await input({
        message: "Enter the graph name:",
        default: defaultName,
        validate: (value) => (value.trim() ? true : "Graph name cannot be empty"),
      });

      // Public graphs are always hosted
      const customType: GraphType = "hosted";

      // Check if already configured
      const configured = configuredGraphs.find(
        (c) => c.name === customName.trim() && c.type === customType,
      );

      finalSelectedGraph = {
        name: customName.trim(),
        type: customType,
        isOpen: false,
        isConnected: !!configured,
        existingNickname: configured?.nickname,
        isPublicGraph: true,
      };
    } else {
      finalSelectedGraph = selectedGraph;
    }
  }

  // 6. Handle already connected graph
  if (finalSelectedGraph.isConnected) {
    if (nonInteractive) {
      // Non-interactive: error with hint to use --remove
      console.error(
        `Error: Graph "${finalSelectedGraph.name}" is already connected as "${finalSelectedGraph.existingNickname}".`,
      );
      console.error(
        `To replace the token, first remove it:\n  roam connect --remove --nickname ${finalSelectedGraph.existingNickname}`,
      );
      process.exit(1);
    }

    const existingConfig = configuredGraphs.find(
      (c) => c.name === finalSelectedGraph.name && c.type === finalSelectedGraph.type,
    );

    if (existingConfig?.lastKnownTokenStatus === "revoked") {
      // Token has been revoked — show revoked-specific menu
      const action = await select({
        message: `The token for "${finalSelectedGraph.existingNickname}" has been revoked. What would you like to do?`,
        choices: [
          {
            name: "Replace with a new token",
            value: "replace",
          },
          {
            name: "Remove from config",
            value: "remove",
          },
          {
            name: "Cancel",
            value: "cancel",
          },
        ],
      });

      if (action === "cancel") {
        console.log("Cancelled.");
        return;
      }

      if (action === "remove") {
        await removeGraphFromConfig(finalSelectedGraph.existingNickname!);
        console.log(`Removed "${finalSelectedGraph.existingNickname}" from config.`);
        return;
      }

      // action === "replace" — fall through to token request flow
    } else {
      // Normal connected flow
      const action = await select({
        message: `This graph is already connected as "${finalSelectedGraph.existingNickname}". What would you like to do?`,
        choices: [
          {
            name: "Change token permissions",
            value: "change-permissions",
          },
          {
            name: "Remove from config",
            value: "remove",
          },
          {
            name: "Cancel",
            value: "cancel",
          },
        ],
      });

      if (action === "cancel") {
        console.log("Cancelled.");
        return;
      }

      if (action === "remove") {
        await removeGraphFromConfig(finalSelectedGraph.existingNickname!);
        console.log(`Removed "${finalSelectedGraph.existingNickname}" from config.`);
        return;
      }

      if (action === "change-permissions") {
        console.log("\nTo change this token's permissions:");
        console.log("  1. Open Roam Desktop and open the graph");
        console.log("  2. Go to Settings > Graph > Local API Tokens");
        console.log("  3. Find the token and adjust its permissions");
        // Permission changes are synced when get_graph_guidelines calls getTokenInfo()
        console.log("\nChanges will be synced automatically next time the MCP is started.");
        return;
      }
    }
  }

  // 7. Select access level
  let accessLevel: string;
  if (finalSelectedGraph.isPublicGraph) {
    accessLevel = "read-only";
    console.log("\nPublic graphs only support read-only access.");
  } else if (nonInteractive) {
    accessLevel = options.accessLevel || "full";
  } else {
    accessLevel = await select({
      message: "Select permissions:",
      choices: [
        {
          name: "Full (read, create, edit, delete)",
          value: "full",
        },
        {
          name: "Read + Append (read, create only)",
          value: "read-append",
        },
        {
          name: "Read Only",
          value: "read-only",
        },
      ],
    });
  }

  // 8. Get nickname (before token request so all input is collected upfront)
  let nickname: string;
  if (nonInteractive) {
    nickname = slugify(options.nickname!);
    console.log(`→ Using nickname: ${nickname}`);
  } else {
    const rawNickname = await input({
      message: "Enter a short name you'll use to refer to this graph:",
      validate: (value) => {
        const slug = slugify(value.trim());
        if (!slug) return "Nickname cannot be empty";
        // Check for existing nickname (excluding the current graph if updating)
        const existing = configuredGraphs.find(
          (g) =>
            g.nickname === slug &&
            !(g.name === finalSelectedGraph.name && g.type === finalSelectedGraph.type),
        );
        if (existing) {
          return `Nickname "${slug}" is already used by "${existing.name}"`;
        }
        return true;
      },
    });

    nickname = slugify(rawNickname.trim());
    console.log(`→ Using nickname: ${nickname}`);
  }

  // 9. Request token (blocks until user approves in Roam)
  console.log("\nWaiting for approval in Roam Desktop...");
  console.log("(A dialog should appear in the Roam app - please approve it)");

  const result = await requestToken(
    port,
    finalSelectedGraph.name,
    finalSelectedGraph.type,
    accessLevel,
  );

  if (!result.success) {
    const errorCode = getErrorCode(result.error);
    const errorMessage = getErrorMessage(result.error);

    switch (errorCode) {
      case "USER_REJECTED":
        console.error("\nToken request was denied in Roam.");
        break;
      case "GRAPH_BLOCKED":
        console.error(
          "\nThis graph has blocked token requests. Unblock it in Roam Settings > Graph > Local API Tokens.",
        );
        break;
      case "TIMEOUT":
        console.error("\nNo response after 5 minutes. Please try again.");
        break;
      case "REQUEST_IN_PROGRESS":
        console.error("\nAnother token request is already pending for this graph.");
        break;
      default:
        console.error(`\nError: ${errorMessage}`);
    }
    process.exit(1);
  }

  // 10. Save to config
  if (!result.token) {
    // should not happen but just in case
    console.error("\nError: Server returned success but no token was provided.");
    process.exit(1);
  }

  const graphConfig: GraphConfig = {
    name: finalSelectedGraph.name,
    type: finalSelectedGraph.type,
    token: result.token,
    nickname,
    accessLevel: result.grantedAccessLevel as AccessLevel,
  };

  await saveGraphToConfig(graphConfig);

  console.log(
    `\nConnected! Graph ${finalSelectedGraph.name} (nickname: ${nickname}) has been saved to ~/.roam-tools.json`,
  );
  console.log(`\nGranted permissions: ${result.grantedAccessLevel}`);

  if (result.grantedAccessLevel !== accessLevel) {
    console.log(
      `(Note: You requested "${accessLevel}" but were granted "${result.grantedAccessLevel}" based on your permissions)`,
    );
  }
}
