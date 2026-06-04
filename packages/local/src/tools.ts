import {
  routeToolCall as coreRouteToolCall,
  defineStandaloneTool,
  tools as coreTools,
  RoamError,
  ErrorCodes,
  type RouteToolCallOptions,
  type CallToolResult,
  type ToolDefinition,
  type StandaloneToolDefinition,
  type ToolGraph,
  type RoamActionClient,
} from "@roam-research/roam-tools-core";
import { resolveGraph, getPort, updateGraphTokenStatus } from "./graph-resolver.js";
import { RoamClient } from "./client.js";
import {
  ListGraphsSchema,
  SetupNewGraphSchema,
  listGraphs,
  setupNewGraph,
} from "./operations/graphs.js";

// Local-only standalone tools (read ~/.roam-tools.json, talk to Roam Desktop API).
// Unlike the hosted standalones (a no-op redirect), the local setup_new_graph
// genuinely writes — it requests a token (user grant) and saves to
// ~/.roam-tools.json — so it is NOT read-only. openWorldHint is false for both:
// they only talk to the user's own Roam Desktop.
export const graphManagementTools: StandaloneToolDefinition[] = [
  defineStandaloneTool(
    "list_graphs",
    "List all configured graphs with their nicknames. Also provides setup instructions for connecting additional graphs.",
    ListGraphsSchema,
    listGraphs,
    {
      title: "List graphs",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ),
  defineStandaloneTool(
    "setup_new_graph",
    "Set up a new Roam graph for access, or list available graphs. Call without arguments to see which graphs are available in Roam Desktop. Call with graph and nickname to connect a specific graph — ask the user what they'd like to call the graph before choosing a nickname. The user will see an approval dialog in Roam desktop app and must approve the token request. If the graph is already configured, returns the existing configuration without making changes.",
    SetupNewGraphSchema,
    setupNewGraph,
    {
      title: "Set up new graph",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ),
];

// Combined tool registry: local standalones + core's client tools.
export const tools: ToolDefinition[] = [...graphManagementTools, ...coreTools];

export function findTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

// ============================================================================
// Default injection points for local routeToolCall. Exported so callers can
// reuse them while overriding others (e.g., custom resolveGraph + default
// createClient).
// ============================================================================

export async function defaultResolveGraph(graph?: string) {
  return resolveGraph(graph);
}

export async function defaultCreateClient(graph: ToolGraph): Promise<RoamActionClient> {
  if (!graph.token) {
    throw new RoamError(
      "Local createClient requires graph.token. " +
        "If you injected a custom resolveGraph that omits token, also inject createClient.",
      ErrorCodes.INTERNAL_ERROR,
    );
  }
  const port = await getPort();
  return new RoamClient({
    graphName: graph.name,
    graphType: graph.type,
    token: graph.token,
    port,
  });
}

// All core options become optional (locals fill in defaults). standaloneHandlers
// is re-added here because core has no standalone tools after the split. The
// Omit is defensive — it's a no-op today (core has no standaloneHandlers field)
// but prevents silent merging if anyone re-adds it to core later.
export type LocalRouteToolCallOptions = Partial<
  Omit<RouteToolCallOptions, "standaloneHandlers">
> & {
  /**
   * Override standalone tool handlers (e.g., a different list_graphs implementation).
   * Tools not present here use the default actions defined in graphManagementTools.
   */
  standaloneHandlers?: Partial<Record<string, (args: unknown) => Promise<CallToolResult>>>;
};

// Inlined ~12 lines (duplicated from core/tools.ts — kept core's API clean rather
// than exporting roamErrorResult). Extract to a shared util if a third site needs it.
function roamErrorResult(error: RoamError): CallToolResult {
  const errorPayload = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.context || {}),
    },
  };
  return {
    content: [{ type: "text", text: JSON.stringify(errorPayload, null, 2) }],
    isError: true,
  };
}

/**
 * Local-defaults wrapper around core's routeToolCall.
 *
 * - Dispatches local standalone tools (list_graphs, setup_new_graph) directly,
 *   since core no longer knows about them.
 * - Falls back to local resolveGraph + RoamClient for client tools when options
 *   don't override them.
 * - Defaults tokenInfoMode to "local-sync" (core's default is "skip"), preserving
 *   the desktop token-info side-flow on get_graph_guidelines.
 * - Defaults onTokenStatusUpdate to writing ~/.roam-tools.json.
 */
export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options: LocalRouteToolCallOptions = {},
): Promise<CallToolResult> {
  // 1. Local standalone tools first (graphManagementTools).
  const localStandalone = graphManagementTools.find((t) => t.name === toolName);
  if (localStandalone) {
    const handler = options.standaloneHandlers?.[toolName] ?? localStandalone.action;
    const parsed = localStandalone.schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments: ${parsed.error.message}`);
    }
    try {
      return await handler(parsed.data);
    } catch (e) {
      if (e instanceof RoamError) return roamErrorResult(e);
      throw e;
    }
  }

  // 2. Otherwise delegate to core, filling in local defaults.
  return coreRouteToolCall(toolName, args, {
    resolveGraph: options.resolveGraph ?? defaultResolveGraph,
    createClient: options.createClient ?? defaultCreateClient,
    tokenInfoMode: options.tokenInfoMode ?? "local-sync",
    onTokenStatusUpdate: options.onTokenStatusUpdate ?? updateGraphTokenStatus,
  });
}
