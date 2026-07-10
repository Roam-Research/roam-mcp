// Re-export MCP types for tool results
export type {
  CallToolResult,
  TextContent,
  ImageContent,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Helper to create a text result
export function textResult(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const result: CallToolResult = { content: [{ type: "text", text }] };
  // Additive structured output: when value is a plain object, also expose it as
  // structuredContent so tools that declare an outputSchema satisfy the SDK's
  // validation (it requires structuredContent on success). The text block above
  // is unchanged. Arrays/strings/null get text only — tools returning those declare
  // no outputSchema, so the registration strip-gate keeps them content-only.
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    result.structuredContent = value as Record<string, unknown>;
  }
  return result;
}

// Helper to create an image result
export function imageResult(data: string, mimeType: string): CallToolResult {
  return { content: [{ type: "image", data, mimeType }] };
}

// Helper to create an error result
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ============================================================================
// v2.0.0 Configuration Types
// ============================================================================

// Graph type: hosted (cloud) or offline (local)
export type GraphType = "hosted" | "offline";

// Access level type.
// NOTE: `read-edit-own` (read + append + edit/delete ONLY the agent's own content) is shipped in the
// remote/hosted MCP, enforced server-side on its shared write path. The LOCAL Desktop API tier is
// deferred: the local API exposes the full `roamAlphaAPI` surface (an open-ended set of edit
// actions), not the hosted MCP's closed allowlist, so gating it there is a larger effort.
// `accessLevel` is carried, not enforced, in core.
export type AccessLevel = "read-only" | "read-append" | "read-edit-own" | "full";

// Config file schema for ~/.roam-tools.json
// Graph names can only contain alphanumeric characters, hyphens, and underscores
const GRAPH_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export const GraphConfigSchema = z.object({
  name: z
    .string()
    .regex(
      GRAPH_NAME_PATTERN,
      "Graph name can only contain letters, numbers, hyphens, and underscores",
    )
    .describe("Actual graph name in Roam"),
  type: z.enum(["hosted", "offline"]).default("hosted").describe("Graph type"),
  token: z.string().startsWith("roam-graph-local-token-").describe("Local API token"),
  nickname: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Nickname must be lowercase letters, numbers, and hyphens")
    .describe("Short identifier for the graph (lowercase, hyphens, no spaces)"),
  accessLevel: z
    .enum(["read-only", "read-append", "read-edit-own", "full"])
    .optional()
    .describe("Token access level"),
  lastKnownTokenStatus: z
    .enum(["active", "revoked"])
    .optional()
    .describe("Token validity status from last sync with Roam"),
});
export type GraphConfig = z.infer<typeof GraphConfigSchema>;

export const RoamMcpConfigSchema = z.object({
  version: z.number().int().positive().optional(),
  graphs: z.array(GraphConfigSchema).min(1, "At least one graph must be configured"),
});
export type RoamMcpConfig = z.infer<typeof RoamMcpConfigSchema>;

// Cross-transport graph identity. Local resolver populates `token`;
// hosted resolver (out-of-repo) omits it because auth lives elsewhere.
export interface ToolGraph {
  name: string;
  type: GraphType;
  nickname: string;
  accessLevel?: AccessLevel;
  token?: string;
}

// Resolved graph info (returned by the local resolveGraph). Token is required;
// lastKnownTokenStatus is a local-config-only field driven by ~/.roam-tools.json.
export interface ResolvedGraph extends ToolGraph {
  token: string;
  lastKnownTokenStatus?: "active" | "revoked";
}

// ============================================================================
// Error Codes and Custom Errors
// ============================================================================

// Error codes from Local API and MCP-specific errors
export const ErrorCodes = {
  // 400 errors
  VERSION_MISMATCH: "VERSION_MISMATCH",
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // 401 errors
  MISSING_TOKEN: "MISSING_TOKEN",
  INVALID_TOKEN_FORMAT: "INVALID_TOKEN_FORMAT",
  WRONG_GRAPH_TYPE: "WRONG_GRAPH_TYPE",
  TOKEN_NOT_FOUND: "TOKEN_NOT_FOUND",

  // 403 errors
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  SCOPE_EXCEEDS_PERMISSION: "SCOPE_EXCEEDS_PERMISSION",
  USER_REJECTED: "USER_REJECTED",
  GRAPH_BLOCKED: "GRAPH_BLOCKED",

  // Token request errors
  TIMEOUT: "TIMEOUT",
  REQUEST_IN_PROGRESS: "REQUEST_IN_PROGRESS",

  // 404 errors
  UNKNOWN_ACTION: "UNKNOWN_ACTION",

  // 500 errors
  TOKEN_FILE_CORRUPTED: "TOKEN_FILE_CORRUPTED",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // MCP-specific errors (not from Local API)
  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  GRAPH_NOT_CONFIGURED: "GRAPH_NOT_CONFIGURED",
  GRAPH_NOT_SELECTED: "GRAPH_NOT_SELECTED",
  CONNECTION_FAILED: "CONNECTION_FAILED",
  CONFIG_TOO_NEW: "CONFIG_TOO_NEW",

  // Cloud-transport codes — emitted by the hosted client against its own
  // backend. Local does not emit these today.
  MISSING_AUTH: "MISSING_AUTH", // 401 — Hosted auth gate failed (no token, malformed token, or invalid signature/issuer/audience). Same agent semantics as MISSING_TOKEN; distinct for operational telemetry across transports.
  INSUFFICIENT_PERMISSION: "INSUFFICIENT_PERMISSION", // 403 — A prior grant existed but Roam-side graph access has been revoked since. Distinct from TOKEN_NOT_FOUND ("never authorized"): INSUFFICIENT_PERMISSION = "ask user to re-grant"; TOKEN_NOT_FOUND = "pick a different graph or grant fresh access".
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED", // 501 — Action recognized in dispatch but handler not yet wired (Phase 3 backlog). Distinct from ACTION_NOT_AVAILABLE: NOT_IMPLEMENTED implies "will work eventually"; ACTION_NOT_AVAILABLE implies "not available on this transport, period".
  GRAPH_UNSUPPORTED: "GRAPH_UNSUPPORTED", // 400 — Encrypted graph rejection (backend can't decrypt). Agent should not retry; instruct user the graph type isn't supported via cloud transport.
  ACTION_NOT_AVAILABLE: "ACTION_NOT_AVAILABLE", // 501 — Action symbol absent from cloud's dispatch entirely (typo OR action like file.upload that's local-only and intentionally not on cloud). Same agent semantics as UNKNOWN_ACTION (which is local-API 404); distinct for operational telemetry across transports.
  PEER_NOT_READY: "PEER_NOT_READY", // 503 — Backend peer instance starting up. Always retryable; reads use exponential backoff (200/400/800ms × 3 attempts) before surfacing; writes throw immediately (non-idempotent).
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// Custom error class with error code and optional context.
//
// The `code` parameter accepts both the canonical `ErrorCode` literals
// (for autocomplete + cross-package consistency) AND arbitrary strings
// (so transports can pass through codes emitted by their backend without
// requiring a coordinated PR to extend the union). The `(string & {})`
// intersection is the "branded string" idiom — structurally a no-op,
// but it prevents TypeScript from collapsing the union to plain `string`,
// preserving IDE autocomplete on `ErrorCodes.X` members.
export class RoamError extends Error {
  constructor(
    message: string,
    public readonly code?: ErrorCode | (string & {}),
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RoamError";
  }
}

// ============================================================================
// API Types
// ============================================================================

// Config version for ~/.roam-tools.json format compatibility.
// Users may have different versions of roam-mcp and roam-cli installed,
// so a newer version may write a config that an older version can't parse.
// Bump this when the config schema changes in a breaking way.
export const CONFIG_VERSION = 1;

// API version this client expects. Sent as `expectedApiVersion` in every request.
// Roam's compatibility check compares major.minor ONLY — patch is ignored.
// So 1.1.0, 1.1.1, 1.1.2 are all compatible; 1.1.x and 1.2.x are NOT.
//
// When to bump:
// - Patch bump on Roam side (e.g. 1.1.1 → 1.1.2): no change needed here, but
//   you can bump for cosmetic alignment.
// - Minor bump on Roam side (e.g. 1.1.x → 1.2.0): MUST bump here too, or all
//   requests will fail with VERSION_MISMATCH.
// - This is independent of the npm package version (0.x.y in package.json).
export const EXPECTED_API_VERSION = "1.2.0";

// Roam API error structure
export interface RoamApiError {
  message: string;
  code?: string;
}

// Helper to extract error message from RoamResponse
export function getErrorMessage(error: string | RoamApiError | undefined): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.message;
}

// Roam API response types
export interface RoamResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string | RoamApiError;
  apiVersion?: string;
  expectedApiVersion?: string;
}

// Block types
export interface Block {
  uid: string;
  string: string;
  children?: Block[];
  open?: boolean;
  heading?: number;
  "text-align"?: "left" | "center" | "right" | "justify";
  "children-view-type"?: "bullet" | "numbered" | "document";
}

// Page types
export interface Page {
  uid: string;
  title: string;
  children?: Block[];
  "children-view-type"?: "bullet" | "numbered" | "document";
}

// Location for simple block operations (moveBlock).
// createBlock builds its own location object to support pageTitle/dailyNotePage targets.
export interface BlockLocation {
  "parent-uid": string;
  order: number | "first" | "last";
}

// Window types for sidebar
export type WindowType = "mentions" | "block" | "outline" | "graph" | "search-query";

export interface SidebarWindow {
  type: WindowType;
  "block-uid"?: string;
  "search-query-str"?: string;
  order?: number;
}

// Sidebar window as returned by getWindows
export interface SidebarWindowInfo {
  type: WindowType;
  "window-id": string;
  "block-uid"?: string;
  "mentions-uid"?: string;
  "search-query-str"?: string;
  order?: number;
  "pinned-to-top?"?: boolean;
  collapsed?: boolean;
}

// Focused block info
export interface FocusedBlock {
  "block-uid": string;
  "window-id": string;
}

// Selected block info (from multi-select)
export interface SelectedBlock {
  "block-uid": string;
}

// Main window view types
export type MainWindowViewType =
  | "outline"
  | "log"
  | "graph"
  | "diagram"
  | "pdf"
  | "search"
  | "custom";

export interface MainWindowView {
  type: MainWindowViewType;
  uid?: string;
  title?: string;
  "block-string"?: string;
  id?: string;
  args?: unknown[];
}

// Search result path item
export interface SearchResultPath {
  uid: string;
  title: string;
}

// Search result
export interface SearchResult {
  uid: string;
  markdown: string;
  path: SearchResultPath[];
  type?: "page"; // Only present for page results
}

// Search response with pagination
export interface SearchResponse {
  queriedAt?: string;
  total: number;
  results: SearchResult[];
}

// Block entry within a recently opened page
export interface RecentlyOpenedBlock {
  uid: string;
  string: string;
  openedAt: string; // ISO 8601
  path?: string; // breadcrumb path (present when includePath=true)
}

// Recently opened page (from user's navigation history, grouped by page)
export interface RecentlyOpenedItem {
  uid: string;
  title: string;
  type: "page";
  openedAt: string; // ISO 8601
  visitCount: number; // how many times page appeared in history
  totalDurationMs: number; // sum of all visit durations
  currentlyOpen?: boolean; // true only on the page user is viewing right now
  blocks?: RecentlyOpenedBlock[]; // blocks the user navigated to on this page
}

// Aggregate gap-time entry (time not spent on any specific page)
export interface DailyNotePagesViewItem {
  type: "dailyNotePagesView";
  totalDurationMs: number;
  currentlyOpen: boolean; // true if the daily-notes-pages view is active (i.e., user isn't viewing any specific page)
}

// Recently edited page (lightweight metadata + edit info)
export interface RecentlyEditedPage {
  uid: string;
  title: string;
  editedBy: string;
  editedAt: string; // ISO 8601
}

// Response shape when search is called with empty query
export interface SearchSuggestionsResponse {
  queriedAt?: string;
  suggestions: {
    recentlyOpenedByUser: (RecentlyOpenedItem | DailyNotePagesViewItem)[];
    recentlyEditedPages: RecentlyEditedPage[];
  };
}

// Template result
export interface Template {
  name: string;
  uid: string;
  content: string;
}

// Search templates response
export interface SearchTemplatesResponse {
  queriedAt?: string;
  results: Template[];
}

// getPage response
export interface GetPageResponse {
  uid: string;
  markdown: string;
  queriedAt: string;
}

// getBlock response
export interface GetBlockResponse {
  uid: string;
  markdown: string;
  path: string[]; // breadcrumb path as markdown strings (vector via ai-md/block-path-markdown)
  queriedAt: string;
}

// Query result (from roamQuery)
export interface QueryResult {
  uid: string;
  markdown: string;
  path?: string; // Breadcrumb path as string (e.g., "Page > Parent > ...")
  type?: "page"; // Only present for page results
}

// Query response with pagination
export interface QueryResponse {
  queriedAt?: string;
  total: number;
  results: QueryResult[];
}

// Token info from POST /api/graphs/tokens/info
export interface TokenInfoResponse {
  success: boolean;
  graphName?: string;
  graphType?: GraphType;
  grantedAccessLevel?: string;
  grantedScopes?: { read?: boolean; append?: boolean; edit?: boolean };
  description?: string;
}

// Three-state result for getTokenInfo()
export type TokenInfoResult =
  | { status: "active"; info: TokenInfoResponse }
  | { status: "revoked" }
  | { status: "unknown" }; // network error, 404, etc.

// Structural client interface used by all operations and routeToolCall. The local
// RoamClient (in @roam-research/roam-tools-local) satisfies this. A hosted
// client (out-of-repo) implements the same shape using a different
// transport. getTokenInfo is optional — the routing layer only invokes it in
// tokenInfoMode === "local-sync".
export interface RoamActionClient {
  call<T = unknown>(action: string, args?: unknown[]): Promise<RoamResponse<T>>;
  getTokenInfo?(): Promise<TokenInfoResult>;
  // Transport's notion of the user's "today" as a yyyy-MM-dd calendar string.
  // Remote returns the picker-timezone date; local returns the machine-local
  // date. Used by createBlock to resolve relative dailyNotePage words. Optional
  // for interface back-compat, but ALL first-party transports implement it —
  // core throws (it never guesses with its own clock) if a relative
  // dailyNotePage word arrives without one.
  getCurrentDate?(): string | undefined;
}
