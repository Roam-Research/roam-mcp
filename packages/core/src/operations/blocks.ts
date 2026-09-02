import { z } from "zod";
import type {
  CallToolResult,
  GetBlockResponse,
  LinkedReference,
  LinkedReferencesPreview,
  RoamActionClient,
} from "../types.js";
import { textResult, successResult, notDeletedError, RoamError, ErrorCodes } from "../types.js";
import { isRelativeDateWord, MM_DD_YYYY, resolveDailyNotePage } from "../relative-date.js";

// Schemas
export const CreateBlockSchema = z.object({
  parentUid: z
    .string()
    .optional()
    .describe(
      "UID of parent block or page. Exactly one of parentUid, pageTitle, or dailyNotePage is required.",
    ),
  pageTitle: z
    .string()
    .optional()
    .describe(
      "Page title to create block under (creates the page if it doesn't exist). Exactly one of parentUid, pageTitle, or dailyNotePage is required.",
    ),
  dailyNotePage: z
    .string()
    .refine((v) => MM_DD_YYYY.test(v) || isRelativeDateWord(v), {
      message:
        "Must be MM-DD-YYYY format (e.g. '03-17-2026') or a relative day: 'today', 'yesterday', or 'tomorrow'",
    })
    .optional()
    .describe(
      "Target a daily note page, creating it if needed. Either a date in MM-DD-YYYY format (e.g. '03-17-2026') or a relative day: 'today', 'yesterday', or 'tomorrow' (case-insensitive; resolved to the user's local calendar date). Exactly one of parentUid, pageTitle, or dailyNotePage is required.",
    ),
  nestUnder: z
    .string()
    .optional()
    .describe(
      "Insert under a direct child block matching this string (matches on the block's string field, including markup like **bold** or [[links]]). If no match exists, creates a new child block with this text first, then inserts under it. Works with parentUid, pageTitle, or dailyNotePage.",
    ),
  markdown: z.string().describe("Markdown content for the block"),
  order: z
    .union([z.coerce.number(), z.enum(["first", "last"])])
    .optional()
    .describe("Position (number, 'first', or 'last'). Defaults to 'last'"),
  open: z
    .boolean()
    .optional()
    .describe(
      "Collapse state of the top-level blocks created from `markdown` (the ones whose uids are returned). false = created collapsed: children hidden behind the caret until expanded. Nested children and the nestUnder section block are unaffected. Default true.",
    ),
});

export const AppendToDailyNoteSchema = z.object({
  markdown: z.string().describe("Markdown to append as one or more new blocks."),
  nestUnder: z
    .string()
    .optional()
    .describe(
      "Optional: add beneath an existing top-level section block on the daily note (e.g. 'TODOs'), matched by exact text (including markup like [[links]]); created if absent. Omit to append at the page's top level.",
    ),
  date: z
    .string()
    .refine((v) => MM_DD_YYYY.test(v) || isRelativeDateWord(v), {
      message:
        "Must be MM-DD-YYYY format (e.g. '03-17-2026') or a relative day: 'today', 'yesterday', or 'tomorrow'",
    })
    .optional()
    .describe(
      "Which daily note to append to: a date in MM-DD-YYYY format, or a relative day 'today'/'yesterday'/'tomorrow' (case-insensitive; resolved to the user's local calendar date). Defaults to today.",
    ),
  open: z
    .boolean()
    .optional()
    .describe(
      "Collapse state of the top-level blocks created from `markdown` (the ones whose uids are returned). false = created collapsed: children hidden behind the caret until expanded. Nested children and the nestUnder section block are unaffected. Default true.",
    ),
});

export const GetBlockSchema = z.object({
  uid: z.string().describe("Block UID"),
  maxDepth: z.coerce
    .number()
    .optional()
    .describe("Max depth of children to include in markdown (omit for full tree)"),
});

// shared by update_block and update_blocks so the two cannot drift
const BlockUpdateFields = z.object({
  uid: z.string().describe("Block UID"),
  string: z
    .string()
    .optional()
    .describe(
      "New literal text for this block (the Roam block string, including inline markup like **bold**, [[links]], ((refs))). Set as-is — NOT parsed into nested child blocks. Updates this one block only.",
    ),
  open: z.boolean().optional().describe("Collapse state"),
  heading: z.coerce.number().optional().describe("Heading level (0-3)"),
  childrenViewType: z
    .enum(["bullet", "numbered", "document"])
    .optional()
    .describe("How children are displayed (bullet, numbered, or document)"),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional().describe("Text alignment"),
});

export const UpdateBlockSchema = BlockUpdateFields;

export const UpdateBlocksSchema = z.object({
  updates: z
    .array(BlockUpdateFields)
    .min(1)
    .max(25)
    .describe(
      "Blocks to update, 1-25 items, each targeting one block by uid. `results` reports them in this order.",
    ),
});

export const DeleteBlockSchema = z.object({
  uid: z.string().describe("Block UID to delete"),
});

export const DeleteBlocksSchema = z.object({
  uids: z
    .array(z.string())
    .min(1)
    .max(25)
    .describe(
      "Block UIDs to delete, 1-25 items, each with its whole subtree. A uid nested under another listed uid is redundant. `results` reports them in this order.",
    ),
});

export const MoveBlockSchema = z.object({
  uid: z.string().describe("Block UID to move"),
  parentUid: z.string().describe("UID of the new parent block or page"),
  order: z
    .union([z.coerce.number(), z.enum(["first", "last"])])
    .describe("Position in the new parent (number, 'first', or 'last')"),
});

export const GetBacklinksSchema = z.object({
  uid: z.string().optional().describe("UID of page or block (required if no title)"),
  title: z.string().optional().describe("Page title (required if no uid)"),
  offset: z.coerce
    .number()
    .optional()
    .describe("Skip first N results — a non-negative integer (default: 0)"),
  limit: z.coerce.number().optional().describe("Max results to return (default: 20)"),
  sort: z
    .enum(["created-date", "edited-date", "daily-note-date"])
    .optional()
    .describe("Sort order (default: created-date)"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: desc)"),
  search: z
    .string()
    .optional()
    .describe("Filter results by text match (searches block, parents, children, page title)"),
  includePath: z
    .boolean()
    .optional()
    .describe("Include breadcrumb path to each result (default: true)"),
  maxDepth: z.coerce
    .number()
    .optional()
    .describe("Max depth of children to include in markdown (default: 1)"),
});

// Types derived from schemas
export type CreateBlockParams = z.infer<typeof CreateBlockSchema>;
export type AppendToDailyNoteParams = z.infer<typeof AppendToDailyNoteSchema>;
export type GetBlockParams = z.infer<typeof GetBlockSchema>;
export type UpdateBlockParams = z.infer<typeof UpdateBlockSchema>;
export type UpdateBlocksParams = z.infer<typeof UpdateBlocksSchema>;
export type DeleteBlockParams = z.infer<typeof DeleteBlockSchema>;
export type DeleteBlocksParams = z.infer<typeof DeleteBlocksSchema>;
export type MoveBlockParams = z.infer<typeof MoveBlockSchema>;
export type GetBacklinksParams = z.infer<typeof GetBacklinksSchema>;

// Keep response types as interfaces (not input schemas)
// `BacklinkResult` keeps its historical export name (alias of the shared type)
export type BacklinkResult = LinkedReference;
export type { LinkedReference, LinkedReferencesPreview };

export interface GetBacklinksResponse {
  queriedAt?: string;
  total: number;
  shown?: number; // results.length; hidden filtering runs after pagination, so it can be < limit
  results: BacklinkResult[];
  // both present iff a non-empty window was consumed and more remain (limit 0 emits neither);
  // pass `offset: nextOffset` next (never offset + shown)
  note?: string;
  nextOffset?: number;
}

export async function createBlock(
  client: RoamActionClient,
  params: CreateBlockParams,
): Promise<CallToolResult> {
  // Validate: exactly one of parentUid, pageTitle, or dailyNotePage
  const targets = [params.parentUid, params.pageTitle, params.dailyNotePage].filter(
    (v) => v !== undefined,
  );
  if (targets.length === 0) {
    throw new RoamError(
      "Either 'parentUid', 'pageTitle', or 'dailyNotePage' is required to specify where to create the block",
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  if (targets.length > 1) {
    throw new RoamError(
      "Provide only one of 'parentUid', 'pageTitle', or 'dailyNotePage'",
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  // Resolve a relative dailyNotePage ("today"/"yesterday"/"tomorrow") to a
  // concrete MM-DD-YYYY before it goes on the wire, against the transport's
  // notion of "today" (remote: picker timezone; local: machine clock). A
  // literal MM-DD-YYYY passes through unchanged, so the backend/renderer see no
  // new vocabulary.
  const resolvedDailyNote =
    params.dailyNotePage !== undefined
      ? resolveDailyNotePage(params.dailyNotePage, client.getCurrentDate?.())
      : undefined;

  const location: Record<string, unknown> = {
    order: params.order ?? "last",
  };
  if (params.parentUid !== undefined) {
    location["parent-uid"] = params.parentUid;
  } else if (resolvedDailyNote !== undefined) {
    location["page-title"] = { "daily-note-page": resolvedDailyNote };
  } else {
    location["page-title"] = params.pageTitle;
  }
  if (params.nestUnder !== undefined) {
    location["nest-under-str"] = params.nestUnder;
  }

  const args: Record<string, unknown> = { location, "markdown-string": params.markdown };
  if (params.open !== undefined) {
    args.open = params.open;
  }

  const response = await client.call<{ uids: string[] }>("data.block.fromMarkdown", [args]);
  return textResult(response.result ?? { uids: [] });
}

export async function appendToDailyNote(
  client: RoamActionClient,
  params: AppendToDailyNoteParams,
): Promise<CallToolResult> {
  // Capture wrapper over create_block's daily-note path: resolve the target day
  // (relative words against the transport's "today"; defaults to today) and append
  // via data.block.fromMarkdown — nestUnder finds-or-creates the section.
  const resolvedDailyNote = resolveDailyNotePage(params.date ?? "today", client.getCurrentDate?.());

  const location: Record<string, unknown> = {
    order: "last",
    "page-title": { "daily-note-page": resolvedDailyNote },
  };
  if (params.nestUnder !== undefined) {
    location["nest-under-str"] = params.nestUnder;
  }

  const args: Record<string, unknown> = { location, "markdown-string": params.markdown };
  if (params.open !== undefined) {
    args.open = params.open;
  }

  const response = await client.call<{ uids: string[] }>("data.block.fromMarkdown", [args]);
  return textResult(response.result ?? { uids: [] });
}

export async function getBlock(
  client: RoamActionClient,
  params: GetBlockParams,
): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = { uid: params.uid };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<GetBlockResponse | undefined>("data.ai.getBlock", [apiParams]);
  // Not-found: a found block always has a `uid`, so treat a nullish/uid-less result
  // (incl. `{}`) as a miss and return an explicit { found: false } signal — clearer
  // than an empty object that reads as a successful empty block.
  return textResult(response.result?.uid ? response.result : { found: false });
}

// camelCase → the kebab wire keys the server expects; keys only when defined (shared by both update tools)
function blockUpdateWireFields(params: UpdateBlockParams): Record<string, unknown> {
  const block: Record<string, unknown> = { uid: params.uid };
  if (params.string !== undefined) block.string = params.string;
  if (params.open !== undefined) block.open = params.open;
  if (params.heading !== undefined) block.heading = params.heading;
  if (params.childrenViewType !== undefined) block["children-view-type"] = params.childrenViewType;
  if (params.textAlign !== undefined) block["text-align"] = params.textAlign;
  return block;
}

export async function updateBlock(
  client: RoamActionClient,
  params: UpdateBlockParams,
): Promise<CallToolResult> {
  const response = await client.call("data.block.update", [
    { block: blockUpdateWireFields(params) },
  ]);
  return successResult(response.result);
}

export async function deleteBlock(
  client: RoamActionClient,
  params: DeleteBlockParams,
): Promise<CallToolResult> {
  const response = await client.call<{ deleted?: boolean; reason?: unknown } | null>(
    "data.block.delete",
    [{ block: { uid: params.uid } }],
  );
  // Strictly `=== false`: current Roam servers report {deleted: false} when the target
  // didn't exist; an ABSENT field means an older Roam that doesn't report — status quo.
  if (response.result?.deleted === false) {
    throw notDeletedError("block", params.uid, response.result.reason);
  }
  return successResult(response.result);
}

// --- Batch writes (update_blocks / delete_blocks) ---

// one item of the server's per-item report (facts only; core derives success and copy)
type BatchItemReport = Record<string, unknown>;

const BATCH_UNSUPPORTED =
  "This Roam build doesn't support batch block updates yet — use update_block / delete_block one at a time, or update Roam.";

// Fail closed: a truncated, misaligned, or non-boolean-`ok` report surfaces as an error carrying the
// raw payload, never as synthesized outcomes (a bad `ok` would also fail the SDK's schema check).
function validateBatchReport(action: string, uids: string[], payload: unknown): BatchItemReport[] {
  const malformed = (why: string) =>
    new RoamError(
      `${action} returned a malformed batch report (${why}), so no per-item outcome can be trusted. Re-read the targets with get_block before retrying.`,
      ErrorCodes.INTERNAL_ERROR,
      { action, payload },
    );
  const results = (payload as { results?: unknown } | null | undefined)?.results;
  if (!Array.isArray(results)) throw malformed("`results` is not an array");
  if (results.length !== uids.length)
    throw malformed(`expected ${uids.length} items, got ${results.length}`);
  return results.map((item, i) => {
    if (item === null || typeof item !== "object" || Array.isArray(item))
      throw malformed(`item ${i} is not an object`);
    const report = item as BatchItemReport;
    if (report.uid !== uids[i]) throw malformed(`item ${i} does not report its input uid`);
    if (typeof report.ok !== "boolean") throw malformed(`item ${i} has a non-boolean \`ok\``);
    return report;
  });
}

// homogeneous NOT_FOUND copy: same reason gating as notDeletedError (see its comment)
function missingDeletesMessage(uids: string[], results: BatchItemReport[]): string {
  if (results.length === 1) return notDeletedError("block", uids[0], results[0].reason).message;
  const allKnown = results.every(
    (r) => r.reason === undefined || r.reason === null || r.reason === "not-found",
  );
  return allKnown
    ? `Nothing was deleted: none of the ${results.length} blocks exist in this graph. If you ` +
        `deleted an ancestor earlier, or are retrying a delete that timed out, they are already ` +
        `gone — do not retry. Otherwise the uids may be stale, mistyped, or from a different ` +
        `graph: re-locate the targets via search before acting further. See the error context ` +
        `for the per-item report.`
    : `Nothing was deleted: the server gave reasons this version doesn't recognize for some of ` +
        `the ${results.length} blocks. Do NOT assume they are gone — re-read with get_block to ` +
        `see the current state before acting further. See the error context for the per-item ` +
        `report.`;
}

// 0 successes ⇒ a normal MCP error (structuredContent cannot ride an error result)
function batchFailureError(uids: string[], results: BatchItemReport[]): RoamError {
  // not-found deletes carry no wire code: map them to the synthesized NOT_FOUND a single delete
  // gets BEFORE the homogeneity check
  const codes = results.map((r) =>
    typeof r.code === "string" ? r.code : r.deleted === false ? ErrorCodes.NOT_FOUND : undefined,
  );
  const shared = codes[0];
  const homogeneous = shared !== undefined && codes.every((c) => c === shared);
  const context = { results, succeeded: 0, failed: results.length };
  if (homogeneous && shared === ErrorCodes.NOT_FOUND) {
    return new RoamError(missingDeletesMessage(uids, results), shared, context);
  }
  const first = results[0].message;
  const sharedMessage =
    homogeneous && typeof first === "string" && results.every((r) => r.message === first)
      ? first
      : `All ${results.length} items failed — see the error context for the per-item report`;
  return new RoamError(sharedMessage, homogeneous ? shared : ErrorCodes.BATCH_FAILED, context);
}

async function runBatch(
  client: RoamActionClient,
  action: string,
  args: Record<string, unknown>,
  uids: string[],
): Promise<CallToolResult> {
  let response;
  try {
    response = await client.call<unknown>(action, [args]);
  } catch (error) {
    // a Roam build without the batch actions: the API-version gate can't see it (major.minor
    // unchanged), so turn the raw code into advice, keeping the transport's own code and context
    if (
      error instanceof RoamError &&
      (error.code === ErrorCodes.UNKNOWN_ACTION || error.code === ErrorCodes.ACTION_NOT_AVAILABLE)
    ) {
      const apiVersion = error.context?.apiVersion;
      const message =
        typeof apiVersion === "string"
          ? `${BATCH_UNSUPPORTED} This Roam build reports API version ${apiVersion}.`
          : BATCH_UNSUPPORTED;
      throw new RoamError(message, error.code, error.context);
    }
    throw error;
  }
  const results = validateBatchReport(action, uids, response.result);
  const succeeded = results.filter((r) => r.ok === true).length;
  const failed = results.length - succeeded;
  if (succeeded === 0) throw batchFailureError(uids, results);
  // not successResult (it would stamp a mixed batch success:true); aggregates derive from
  // `results` alone, and ≥1 success stays isError:false
  return textResult({ success: failed === 0, succeeded, failed, results });
}

export async function updateBlocks(
  client: RoamActionClient,
  params: UpdateBlocksParams,
): Promise<CallToolResult> {
  return runBatch(
    client,
    "data.block.updateBlocks",
    { updates: params.updates.map(blockUpdateWireFields) },
    params.updates.map((u) => u.uid),
  );
}

export async function deleteBlocks(
  client: RoamActionClient,
  params: DeleteBlocksParams,
): Promise<CallToolResult> {
  return runBatch(client, "data.block.deleteBlocks", { uids: params.uids }, params.uids);
}

export async function moveBlock(
  client: RoamActionClient,
  params: MoveBlockParams,
): Promise<CallToolResult> {
  const response = await client.call("data.block.move", [
    {
      location: {
        "parent-uid": params.parentUid,
        order: params.order,
      },
      block: {
        uid: params.uid,
      },
    },
  ]);
  return successResult(response.result);
}

export async function getBacklinks(
  client: RoamActionClient,
  params: GetBacklinksParams,
): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = {};

  if (params.uid !== undefined) apiParams.uid = params.uid;
  if (params.title !== undefined) apiParams.title = params.title;
  if (params.offset !== undefined) apiParams.offset = params.offset;
  if (params.limit !== undefined) apiParams.limit = params.limit;
  if (params.sort !== undefined) apiParams.sort = params.sort;
  if (params.sortOrder !== undefined) apiParams.sortOrder = params.sortOrder;
  if (params.search !== undefined) apiParams.search = params.search;
  if (params.includePath !== undefined) apiParams.includePath = params.includePath;
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<GetBacklinksResponse>("data.ai.getBacklinks", [apiParams]);
  return textResult(response.result ?? { total: 0, results: [] });
}

// --- Comments ---

export const AddCommentSchema = z.object({
  blockUid: z.string().describe("UID of the block to comment on"),
  comment: z
    .string()
    .optional()
    .describe(
      "Plain text comment (single block, editable later via update_block). Required if commentMarkdown not provided. Preferred for simple comments.",
    ),
  commentMarkdown: z
    .string()
    .optional()
    .describe(
      "Markdown comment parsed into multiple blocks. Required if comment not provided. Use only when you need structure (lists, headings). Harder to edit later.",
    ),
});

export const GetCommentsSchema = z.object({
  blockUid: z.string().describe("UID of the block to get comments for"),
  maxDepth: z.coerce
    .number()
    .optional()
    .describe("Max depth of children to include in each comment's markdown (omit for full tree)"),
});

export type AddCommentParams = z.infer<typeof AddCommentSchema>;
export type GetCommentsParams = z.infer<typeof GetCommentsSchema>;

export interface CommentResult {
  parentUid: string;
  author: string;
  createdTime: string; // ISO 8601
  editedTime: string; // ISO 8601
  markdown: string;
  singleEditableUid: string | null;
}

export interface GetCommentsResponse {
  queriedAt?: string;
  total: number;
  comments: CommentResult[];
}

export async function addComment(
  client: RoamActionClient,
  params: AddCommentParams,
): Promise<CallToolResult> {
  // Validate: exactly one of comment or commentMarkdown must be provided
  const hasComment = params.comment !== undefined;
  const hasCommentMarkdown = params.commentMarkdown !== undefined;
  if (!hasComment && !hasCommentMarkdown) {
    throw new RoamError(
      "Provide one of 'comment' or 'commentMarkdown'",
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  if (hasComment && hasCommentMarkdown) {
    throw new RoamError(
      "Provide 'comment' or 'commentMarkdown', not both",
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  const apiParams: Record<string, unknown> = { "block-uid": params.blockUid };
  if (hasComment) apiParams["reply-string"] = params.comment;
  if (hasCommentMarkdown) apiParams["reply-markdown"] = params.commentMarkdown;

  const response = await client.call<{ uids: string[]; parentUid?: string }>(
    "data.block.addComment",
    [apiParams],
  );
  return textResult(response.result ?? { uids: [] });
}

export async function getComments(
  client: RoamActionClient,
  params: GetCommentsParams,
): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = { uid: params.blockUid };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<GetCommentsResponse>("data.ai.getComments", [apiParams]);
  return textResult(response.result ?? { total: 0, comments: [] });
}
