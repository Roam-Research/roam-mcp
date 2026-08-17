// Barrel export for @roam-research/roam-tools-local.
//
// Re-exports the transport-agnostic surface from @roam-research/roam-tools-core
// (so consumers like @roam-research/roam-mcp and @roam-research/roam-cli only
// need one dependency) AND adds local-Desktop-API-specific symbols on top.
//
// Notably, this package's `tools`, `findTool`, and `routeToolCall` SHADOW
// core's — they include the local-only `list_graphs` / `setup_new_graph`
// standalone tools and bake in local defaults for graph resolution, client
// construction, and token-info sync.

// ----------------------------------------------------------------------------
// Re-exports from core (explicit list, not `export *` — avoids version-dependent
// precedence rules around overlapping named exports).
// ----------------------------------------------------------------------------
export type {
  CallToolResult,
  TextContent,
  ImageContent,
  GraphType,
  AccessLevel,
  GraphConfig,
  RoamMcpConfig,
  ToolGraph,
  ResolvedGraph,
  RoamActionClient,
  ErrorCode,
  RoamApiError,
  RoamResponse,
  Block,
  Page,
  BlockLocation,
  WindowType,
  SidebarWindow,
  SidebarWindowInfo,
  FocusedBlock,
  SelectedBlock,
  MainWindowViewType,
  MainWindowView,
  SearchResultPath,
  SearchResult,
  SearchResponse,
  RecentlyOpenedBlock,
  RecentlyOpenedItem,
  DailyNotePagesViewItem,
  RecentlyEditedPage,
  SearchSuggestionsResponse,
  SearchTemplatesResponse,
  GetPageResponse,
  GetBlockResponse,
  Template,
  QueryResult,
  QueryResponse,
  TokenInfoResponse,
  TokenInfoResult,
  ToolDefinition,
  ClientToolDefinition,
  StandaloneToolDefinition,
  RouteToolCallOptions,
} from "@roam-research/roam-tools-core";

export {
  GraphConfigSchema,
  RoamMcpConfigSchema,
  ErrorCodes,
  RoamError,
  CONFIG_VERSION,
  EXPECTED_API_VERSION,
  textResult,
  successResult,
  imageResult,
  errorResult,
  getErrorMessage,
  defineTool,
  defineStandaloneTool,
  dataTools,
  desktopUiTools,
  contentTools,
  stripUndeclaredStructuredContent,
  DEFAULT_MCP_INSTRUCTIONS,
  // NOTE: tools, findTool, routeToolCall are intentionally NOT re-exported from
  // core — local shadows them with versions that include graphManagementTools
  // and bake in local defaults.
} from "@roam-research/roam-tools-core";

// ----------------------------------------------------------------------------
// Local overrides of tools / findTool / routeToolCall, plus local-only exports.
// ----------------------------------------------------------------------------
export {
  tools,
  findTool,
  routeToolCall,
  graphManagementTools,
  defaultResolveGraph,
  defaultCreateClient,
} from "./tools.js";
export type { LocalRouteToolCallOptions } from "./tools.js";

// Local Roam Desktop API client (formerly in core)
export { RoamClient } from "./client.js";
export type { RoamClientConfig } from "./types.js";

// Local config + graph resolution (formerly in core)
export {
  getPort,
  resolveGraph,
  saveGraphToConfig,
  removeGraphFromConfig,
  updateGraphTokenStatus,
  getConfiguredGraphsSafe,
  getConfiguredGraphs,
  findGraphConfig,
  getMcpConfig,
  getOpenGraphs,
} from "./graph-resolver.js";

// Roam Desktop HTTP API helpers (formerly in core)
export { fetchAvailableGraphs, requestToken, sleep, openRoamApp, slugify } from "./roam-api.js";
export type { AvailableGraph, GraphsResponse, TokenExchangeResponse } from "./roam-api.js";
