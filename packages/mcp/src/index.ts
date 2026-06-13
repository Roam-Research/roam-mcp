#!/usr/bin/env node

// ============================================================================
// CLI subcommand: roam-mcp connect
// Dynamically imports connect to avoid loading @inquirer/prompts during
// normal MCP server operation.
// ============================================================================

if (process.argv[2] === "connect") {
  const args = process.argv.slice(3);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: roam-mcp connect [options]

Connect to a Roam graph and obtain a token.

Options:
  --graph <name>          Graph name (enables non-interactive mode)
  --nickname <name>       Short name for this graph (required with --graph)
  --access-level <level>  Access level: full, read-append, or read-only
  --public                Public graph (read-only, hosted)
  --type <type>           Graph type: hosted or offline
  --remove                Remove a graph connection (use with --graph or --nickname)
  -h, --help              Show this help message

Examples:
  roam-mcp connect                                                              Interactive setup
  roam-mcp connect --graph my-graph --nickname "main graph"                     Connect with defaults
  roam-mcp connect --graph my-graph --nickname "main graph" --access-level full Connect with full access
  roam-mcp connect --graph help --public --nickname "Roam Help"                 Connect to a public graph
  roam-mcp connect --remove --graph help                                        Remove a connection`);
    process.exit(0);
  }

  // These flags must stay in sync with ConnectOptions in packages/local/src/connect.ts
  // and the Commander options in packages/cli/src/index.ts.
  function getFlag(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return undefined;
    const value = args[idx + 1];
    if (value.startsWith("--")) return undefined;
    return value;
  }

  const options = {
    graph: getFlag("--graph"),
    nickname: getFlag("--nickname"),
    accessLevel: getFlag("--access-level"),
    public: args.includes("--public"),
    type: getFlag("--type"),
    remove: args.includes("--remove"),
  };

  const { connect } = await import("@roam-research/roam-tools-local/connect");
  await connect(options);
  process.exit(0);
}

// ============================================================================
// MCP Server (default mode)
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  tools,
  routeToolCall,
  stripUndeclaredStructuredContent,
  getMcpConfig,
  RoamError,
  ErrorCodes,
} from "@roam-research/roam-tools-local";

// If these instructions change, the remote MCP server may need the same update.
const server = new McpServer(
  {
    name: "roam-mcp-local",
    title: "Roam Research",
    description:
      "Tools for reading and writing your Roam Research graph(s): pages, blocks, search, queries, comments, and files.",
    websiteUrl: "https://roamresearch.com",
    version: "0.7.2",
  },
  {
    instructions:
      "This server exposes tools for a user's Roam Research graph(s).\n" +
      "When you start working with a graph this session, orient yourself once:\n" +
      "1. If you don't already know which graph to use, call list_graphs and pick the right one.\n" +
      "2. Call get_graph_guidelines for that graph one time to learn the user's conventions and preferences, then go ahead with the task. Once you've called it for a graph this session, don't call it again for that graph.",
  },
);

// Register each tool with its Zod schema. title + annotations come from each
// tool definition (core data/desktop tools + local standalones); forward them
// generically so the tools/list metadata stays consistent across the local and
// hosted MCP servers.
for (const tool of tools) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
      outputSchema: tool.outputSchema,
    },
    async (args) => {
      try {
        const result = await routeToolCall(tool.name, args as Record<string, unknown>);
        // Schema-less tools are content-only (shared core invariant).
        return stripUndeclaredStructuredContent(result, tool);
      } catch (error) {
        // Safety net for unexpected errors (RoamErrors are handled by routeToolCall)
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: message }],
          isError: true,
        };
      }
    },
  );
}

async function main() {
  // Fail fast if config is from a newer version we can't understand.
  // CONFIG_NOT_FOUND is fine — user may connect later via setup_new_graph.
  try {
    await getMcpConfig();
  } catch (error) {
    if (error instanceof RoamError && error.code === ErrorCodes.CONFIG_TOO_NEW) {
      console.error(error.message);
      process.exit(1);
    }
    // All other errors (CONFIG_NOT_FOUND, etc.) are expected — continue startup
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roam MCP server running");
}

main().catch(console.error);
