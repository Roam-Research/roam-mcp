import { z } from "zod";
import type {
  CallToolResult,
  TokenInfoResponse,
  AccessLevel,
  RoamActionClient,
  ToolGraph,
  ResolvedGraph,
} from "./types.js";
import { RoamError } from "./types.js";
import {
  CreatePageSchema,
  GetPageSchema,
  DeletePageSchema,
  UpdatePageSchema,
  GetGuidelinesSchema,
  createPage,
  getPage,
  deletePage,
  updatePage,
  getGuidelines,
} from "./operations/pages.js";
import {
  CreateBlockSchema,
  GetBlockSchema,
  UpdateBlockSchema,
  DeleteBlockSchema,
  MoveBlockSchema,
  GetBacklinksSchema,
  AddCommentSchema,
  GetCommentsSchema,
  createBlock,
  getBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  getBacklinks,
  addComment,
  getComments,
} from "./operations/blocks.js";
import {
  SearchSchema,
  SearchTemplatesSchema,
  search,
  searchTemplates,
} from "./operations/search.js";
import { QuerySchema, query } from "./operations/query.js";
import { DatalogQuerySchema, datalogQuery } from "./operations/datalog.js";
import {
  GetOpenWindowsSchema,
  GetSelectionSchema,
  OpenMainWindowSchema,
  OpenSidebarSchema,
  getOpenWindows,
  getSelection,
  openMainWindow,
  openSidebar,
} from "./operations/navigation.js";
import {
  FileGetSchema,
  FileUploadSchema,
  FileDeleteSchema,
  getFile,
  uploadFile,
  deleteFile,
} from "./operations/files.js";

// Common schema for graph parameter (used by most tools)
const GraphSchema = z.object({
  graph: z
    .string()
    .optional()
    .describe(
      "Graph to act on, by nickname or name. Optional — if only one graph is available, it is used automatically.",
    ),
});

// Helper to extend any schema with graph parameter
function withGraph<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend(GraphSchema.shape);
}

// Tool that requires a graph/client
export interface ClientToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  action: (client: RoamActionClient, args: unknown) => Promise<CallToolResult>;
  type: "client";
}

// Standalone tool that handles its own graph resolution
export interface StandaloneToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  action: (args: unknown) => Promise<CallToolResult>;
  type: "standalone";
}

export type ToolDefinition = ClientToolDefinition | StandaloneToolDefinition;

// Helper to create tool with graph parameter
export function defineTool<T extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: z.ZodObject<T>,
  action: (client: RoamActionClient, args: z.infer<z.ZodObject<T>>) => Promise<CallToolResult>,
): ClientToolDefinition {
  return {
    name,
    description,
    schema: withGraph(schema),
    action: (client, args) => action(client, args as z.infer<z.ZodObject<T>>),
    type: "client",
  };
}

// Helper to create standalone tool (no graph parameter, handles its own resolution)
export function defineStandaloneTool<T extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: z.ZodObject<T>,
  action: (args: z.infer<z.ZodObject<T>>) => Promise<CallToolResult>,
): StandaloneToolDefinition {
  return {
    name,
    description,
    schema: schema,
    action: (args) => action(args as z.infer<z.ZodObject<T>>),
    type: "standalone",
  };
}

// Note appended to all client tool descriptions
const GUIDELINES_NOTE =
  "\n\n(If you haven't fetched this graph's guidelines yet, call get_graph_guidelines — they may change how to handle this operation.)";

// Data Tools (require graph/client; reusable across local + hosted MCP transports)
export const dataTools: ClientToolDefinition[] = [
  defineTool(
    "get_graph_guidelines",
    "Returns this graph's agent-facing setup: naming conventions, structural preferences, orientation actions, and any constraints the user has explicitly recorded for AI agents. Call once per graph per session before reading or writing content — skipping it means operating on assumptions the user has already overridden, so your work will likely need to be redone. The `nextSteps` field in the response lists orientation actions to take before proceeding. The `roamSyntax` field is a compact, graph-agnostic guide to writing Roam content correctly — read it before your first write.",
    GetGuidelinesSchema,
    getGuidelines,
  ),
  defineTool(
    "create_page",
    "Create a new page in Roam, optionally with markdown content." + GUIDELINES_NOTE,
    CreatePageSchema,
    createPage,
  ),
  defineTool(
    "create_block",
    "Create blocks from markdown content. Target by parentUid, pageTitle, or dailyNotePage (page created if needed). Use nestUnder to insert under a specific child block. Supports nested bulleted lists via markdown indentation." +
      GUIDELINES_NOTE,
    CreateBlockSchema,
    createBlock,
  ),
  defineTool(
    "update_block",
    "Update a single existing block's text and display properties (heading, collapse, alignment, children view type). Affects only the block with `uid`: `string` sets that block's literal text — it is NOT expanded into child blocks (unlike create_block/create_page), and the block's existing children are left untouched. To add or restructure children, use create_block / move_block / delete_block." +
      GUIDELINES_NOTE,
    UpdateBlockSchema,
    updateBlock,
  ),
  defineTool(
    "delete_block",
    "Delete a block and all its children." + GUIDELINES_NOTE,
    DeleteBlockSchema,
    deleteBlock,
  ),
  defineTool(
    "move_block",
    "Move a block to a new location." + GUIDELINES_NOTE,
    MoveBlockSchema,
    moveBlock,
  ),
  defineTool(
    "add_comment",
    "Add a comment to a block (comment thread, NOT a child block). Prefer `comment` for simple text; use `commentMarkdown` for structured content. Same-day calls on the same block append to your existing comment." +
      GUIDELINES_NOTE,
    AddCommentSchema,
    addComment,
  ),
  defineTool(
    "get_comments",
    "Get comments on a block with author, timestamps, and edit info. If singleEditableUid is set, the comment can be edited with update_block. Only works for blocks, not pages." +
      GUIDELINES_NOTE,
    GetCommentsSchema,
    getComments,
  ),
  defineTool(
    "delete_page",
    "Delete a page and all its contents." + GUIDELINES_NOTE,
    DeletePageSchema,
    deletePage,
  ),
  defineTool(
    "update_page",
    "Update a page's title or children view type. Set mergePages to true if renaming to a title that already exists." +
      GUIDELINES_NOTE,
    UpdatePageSchema,
    updatePage,
  ),
  defineTool(
    "search",
    "Search for pages and blocks by text. Returns paginated results with markdown content and optional breadcrumb paths. Call with an empty query to get recently edited and viewed content — useful for understanding what the user is currently working on." +
      GUIDELINES_NOTE,
    SearchSchema,
    search,
  ),
  defineTool(
    "search_templates",
    "Search Roam templates by name. When the user mentions 'my X template' or 'the X template', use this tool to find it. Templates are user-created reusable content blocks tagged with [[roam/templates]]. Returns template name, uid, and content as markdown." +
      GUIDELINES_NOTE,
    SearchTemplatesSchema,
    searchTemplates,
  ),
  defineTool(
    "roam_query",
    'Execute a Roam query ({{query: }} or {{[[query]]: }} blocks, NOT Datalog). Two modes: (1) UID mode - pass a block UID containing a query component to run it with saved settings/filters; (2) Query mode - pass a raw query string like "{and: [[TODO]] {not: [[DONE]]}}". Returns paginated results with markdown content.' +
      GUIDELINES_NOTE,
    QuerySchema,
    query,
  ),
  defineTool(
    "datalog_query",
    "Execute a datomic-style datalog query against the graph's datascript database. Supported clauses: :find, :where, :in, and :timeout (ms). Inputs are positional parameters bound to :in variables after $. Write specific :where clauses to keep results bounded." +
      GUIDELINES_NOTE,
    DatalogQuerySchema,
    datalogQuery,
  ),
  defineTool(
    "get_page",
    "Get a page's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large pages." +
      GUIDELINES_NOTE,
    GetPageSchema,
    getPage,
  ),
  defineTool(
    "get_block",
    "Get a block's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large blocks." +
      GUIDELINES_NOTE,
    GetBlockSchema,
    getBlock,
  ),
  defineTool(
    "get_backlinks",
    "Get paginated backlinks (linked references) for a page or block, formatted as markdown. Returns total count and results with optional breadcrumb paths." +
      GUIDELINES_NOTE,
    GetBacklinksSchema,
    getBacklinks,
  ),
];

// Desktop UI Tools (require local Roam Desktop — file ops + window/selection introspection;
// hosted MCP omits these because the parameters/effects assume a local environment).
export const desktopUiTools: ClientToolDefinition[] = [
  defineTool(
    "get_open_windows",
    "Get the current view in the main window and all open sidebar windows." + GUIDELINES_NOTE,
    GetOpenWindowsSchema,
    getOpenWindows,
  ),
  defineTool(
    "get_selection",
    "Get the currently focused block and any multi-selected blocks." + GUIDELINES_NOTE,
    GetSelectionSchema,
    getSelection,
  ),
  defineTool(
    "open_main_window",
    "Navigate to a page or block in the main window." + GUIDELINES_NOTE,
    OpenMainWindowSchema,
    openMainWindow,
  ),
  defineTool(
    "open_sidebar",
    "Open a page or block in the right sidebar." + GUIDELINES_NOTE,
    OpenSidebarSchema,
    openSidebar,
  ),
  defineTool(
    "file_get",
    "Fetch a file hosted on Roam (handles decryption for encrypted graphs)." + GUIDELINES_NOTE,
    FileGetSchema,
    getFile,
  ),
  defineTool(
    "file_upload",
    "Upload a file to Roam. Returns the Firebase storage URL. Usually you'll want to create a new block with the file as markdown: `![](url)`. Provide ONE of: filePath (preferred - local file, server reads directly), url (remote URL, server fetches), or base64 (raw data, fallback for sandboxed clients)." +
      GUIDELINES_NOTE,
    FileUploadSchema,
    uploadFile,
  ),
  defineTool(
    "file_delete",
    "Delete a file hosted on Roam." + GUIDELINES_NOTE,
    FileDeleteSchema,
    deleteFile,
  ),
];

// Backwards-compatible aggregate of all client tools.
export const contentTools: ClientToolDefinition[] = [...dataTools, ...desktopUiTools];

// All client tools available in core. Local standalone tools (list_graphs,
// setup_new_graph) live in @roam-research/roam-tools-local since they touch
// ~/.roam-tools.json and the Roam Desktop API.
export const tools: ToolDefinition[] = [...dataTools, ...desktopUiTools];

export function findTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * Prepend graph nickname to a tool result.
 */
function prependGraphInfo(result: CallToolResult, nickname: string): CallToolResult {
  const prefix = `Roam graph: ${nickname}`;
  const content = result.content;

  if (!content || content.length === 0) return result;

  const first = content[0];
  if (first.type === "text") {
    return {
      ...result,
      content: [{ ...first, text: `${prefix}\n\n${first.text}` }, ...content.slice(1)],
    };
  }

  // For image or other content types, prepend a text block
  return {
    ...result,
    content: [{ type: "text", text: prefix }, ...content],
  };
}

/**
 * Enrich a JSON text result with token info (accessLevel + scopes).
 */
function enrichResultWithTokenInfo(
  result: CallToolResult,
  info: TokenInfoResponse,
): CallToolResult {
  const first = result.content?.[0];
  if (!first || first.type !== "text") return result;
  try {
    const parsed = JSON.parse(first.text);
    parsed.accessLevel = info.grantedAccessLevel;
    parsed.scopes = info.grantedScopes;
    return {
      ...result,
      content: [{ ...first, text: JSON.stringify(parsed, null, 2) }, ...result.content.slice(1)],
    };
  } catch {
    return result;
  }
}

/**
 * Prepend a token revocation warning to the result.
 */
function enrichResultWithTokenStatus(result: CallToolResult, nickname: string): CallToolResult {
  const warning =
    `Roam graph: ${nickname}\n\n` +
    `WARNING: The token for this graph has been revoked.\n` +
    `Call setup_new_graph with this graph's name to request a new token.\n`;

  const first = result.content?.[0];
  if (first?.type === "text") {
    return {
      ...result,
      content: [{ ...first, text: warning + "\n" + first.text }, ...result.content.slice(1)],
    };
  }
  return {
    ...result,
    content: [{ type: "text", text: warning }, ...(result.content || [])],
  };
}

/**
 * Convert a RoamError into a structured error result with isError: true.
 */
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

export interface RouteToolCallOptions {
  /**
   * Resolve a graph identifier (nickname/name) to a ToolGraph. Required.
   * Local consumers use the resolver from @roam-research/roam-tools-local;
   * hosted consumers wire their own (e.g., reading grants from their own store).
   */
  resolveGraph: (providedGraph?: string) => Promise<ToolGraph>;
  /**
   * Construct a client for the resolved graph. Required.
   * Local consumers return a RoamClient; hosted consumers return a transport
   * that talks to their own backend.
   */
  createClient: (graph: ToolGraph) => Promise<RoamActionClient> | RoamActionClient;
  /**
   * "local-sync" runs the desktop token-info side-flow on get_graph_guidelines:
   * parallel getTokenInfo, access-level validation, status writes, and result
   * enrichment. "skip" (default) disables that side-flow entirely. Graph-name
   * prefix (prependGraphInfo) is unaffected by this mode and runs in both.
   */
  tokenInfoMode?: "local-sync" | "skip";
  /**
   * Only consulted in local-sync mode. Hosted callers may use this to write to
   * their own grant store. If omitted, status changes are not persisted.
   */
  onTokenStatusUpdate?: (
    nickname: string,
    patch: { accessLevel?: AccessLevel; lastKnownTokenStatus?: "active" | "revoked" },
  ) => Promise<void>;
}

export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options: RouteToolCallOptions,
): Promise<CallToolResult> {
  const tool = findTool(toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  // Core only registers client tools. Standalone tools live in
  // @roam-research/roam-tools-local; route them through that wrapper.
  if (tool.type !== "client") {
    throw new Error(
      `Tool ${toolName}: core's routeToolCall only handles client tools. ` +
        `Standalone tools live in @roam-research/roam-tools-local.`,
    );
  }

  // Validate and parse args with Zod
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments: ${parsed.error.message}`);
  }

  const tokenInfoMode = options.tokenInfoMode ?? "skip";
  const updateTokenStatus = options.onTokenStatusUpdate;

  try {
    const { graph: graphArg, ...restArgs } = parsed.data;
    const graph = await options.resolveGraph(graphArg as string | undefined);
    const client = await options.createClient(graph);

    // Special handling for get_graph_guidelines: sync token info in parallel.
    // Only fires in local-sync mode AND when the client implements getTokenInfo.
    // Bind early so TS narrows the optional method through the truthy check.
    const getTokenInfoFn = client.getTokenInfo?.bind(client);
    if (tool.name === "get_graph_guidelines" && tokenInfoMode === "local-sync" && getTokenInfoFn) {
      // In local-sync mode, the resolver is expected to return ResolvedGraph
      // (with lastKnownTokenStatus). If a custom resolver omits the field,
      // the read returns undefined and behavior is identical.
      const resolvedGraph = graph as ResolvedGraph;

      const [actionSettled, tokenInfoSettled] = await Promise.allSettled([
        tool.action(client, restArgs),
        getTokenInfoFn(),
      ]);

      // getTokenInfo() never throws, so always fulfilled
      const tokenInfoResult =
        tokenInfoSettled.status === "fulfilled"
          ? tokenInfoSettled.value
          : { status: "unknown" as const };

      // Handle revoked token FIRST (before examining action result)
      if (tokenInfoResult.status === "revoked") {
        if (updateTokenStatus && resolvedGraph.lastKnownTokenStatus !== "revoked") {
          try {
            await updateTokenStatus(resolvedGraph.nickname, {
              lastKnownTokenStatus: "revoked",
            });
          } catch {
            // best-effort status update
          }
        }

        const baseResult: CallToolResult =
          actionSettled.status === "fulfilled"
            ? actionSettled.value
            : actionSettled.reason instanceof RoamError
              ? roamErrorResult(actionSettled.reason)
              : { content: [{ type: "text", text: String(actionSettled.reason) }], isError: true };

        return enrichResultWithTokenStatus(baseResult, resolvedGraph.nickname);
      }

      // Not revoked — if action failed, propagate the original error
      if (actionSettled.status === "rejected") {
        throw actionSettled.reason;
      }

      const result = actionSettled.value;

      if (tokenInfoResult.status === "active") {
        const info = tokenInfoResult.info;
        // Validate access level before writing to prevent status corruption
        const validLevels: AccessLevel[] = ["read-only", "read-append", "full"];
        const level = validLevels.includes(info.grantedAccessLevel as AccessLevel)
          ? (info.grantedAccessLevel as AccessLevel)
          : undefined;
        // Only write if something actually changed
        const accessLevelChanged = level && resolvedGraph.accessLevel !== level;
        const tokenStatusChanged = resolvedGraph.lastKnownTokenStatus !== "active";
        if (updateTokenStatus && (accessLevelChanged || tokenStatusChanged)) {
          try {
            await updateTokenStatus(resolvedGraph.nickname, {
              ...(accessLevelChanged ? { accessLevel: level } : {}),
              lastKnownTokenStatus: "active",
            });
          } catch {
            // best-effort status update
          }
        }

        if (!result.isError) {
          const enriched = enrichResultWithTokenInfo(result, info);
          return prependGraphInfo(enriched, resolvedGraph.nickname);
        }
        return result;
      }

      // status === "unknown" — action succeeded, so token isn't revoked; clear stale status
      if (updateTokenStatus && resolvedGraph.lastKnownTokenStatus !== "active") {
        try {
          await updateTokenStatus(resolvedGraph.nickname, { lastKnownTokenStatus: "active" });
        } catch {
          // best-effort status update
        }
      }
      if (!result.isError) {
        return prependGraphInfo(result, resolvedGraph.nickname);
      }
      return result;
    }

    // Normal flow for all other tools (and get_graph_guidelines when token-info
    // sync is skipped or unavailable). Graph-name prefix runs in both modes.
    const result = await tool.action(client, restArgs);
    if (!result.isError) {
      return prependGraphInfo(result, graph.nickname);
    }
    return result;
  } catch (error) {
    if (error instanceof RoamError) {
      return roamErrorResult(error);
    }
    throw error;
  }
}
