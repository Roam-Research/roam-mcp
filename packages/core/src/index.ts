// Barrel export for @roam-research/roam-tools-core
//
// Core is transport-agnostic — it does NOT export RoamClient, the
// ~/.roam-tools.json reader, or the connect command. Those live in
// @roam-research/roam-tools-local. Hosted MCP transports depend on this
// package directly and supply their own resolveGraph + createClient via
// routeToolCall's options.

// Types, schemas, error handling, and constants
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
  ToolAnnotations,
} from "./types.js";
export {
  GraphConfigSchema,
  RoamMcpConfigSchema,
  ErrorCodes,
  RoamError,
  CONFIG_VERSION,
  EXPECTED_API_VERSION,
  textResult,
  imageResult,
  errorResult,
  getErrorMessage,
} from "./types.js";

// Tool definitions, helpers, and routing
export {
  tools,
  findTool,
  routeToolCall,
  stripUndeclaredStructuredContent,
  contentTools,
  dataTools,
  desktopUiTools,
  defineTool,
  defineStandaloneTool,
} from "./tools.js";
export type {
  ToolDefinition,
  ClientToolDefinition,
  StandaloneToolDefinition,
  RouteToolCallOptions,
} from "./tools.js";

// localTodayString is the only relative-date helper with an external consumer
// (the local transport's getCurrentDate()). The schema/resolver helpers stay
// core-internal — operations import them directly from ./relative-date.js.
export { localTodayString } from "./relative-date.js";
