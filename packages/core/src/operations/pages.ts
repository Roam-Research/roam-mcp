import { z } from "zod";
import type { CallToolResult, GetPageResponse, RoamActionClient } from "../types.js";
import { textResult } from "../types.js";

// Schemas
export const CreatePageSchema = z.object({
  title: z.string().describe("Page title"),
  markdown: z.string().optional().describe("Markdown content for the page"),
  uid: z
    .string()
    .optional()
    .describe(
      "Custom UID to assign to the new page. Omit to let Roam auto-generate one (recommended)",
    ),
  childrenViewType: z
    .enum(["document", "bullet", "numbered"])
    .optional()
    .describe("How children are displayed (document, bullet, or numbered)"),
});

export const GetPageSchema = z.object({
  title: z.string().optional().describe("Page title (alternative to uid)"),
  uid: z.string().optional().describe("Page UID"),
  maxDepth: z.coerce
    .number()
    .optional()
    .describe("Max depth of children to include in markdown (omit for full tree)"),
});

export const DeletePageSchema = z.object({
  uid: z.string().describe("Page UID to delete"),
});

export const UpdatePageSchema = z.object({
  uid: z.string().describe("Page UID"),
  title: z.string().optional().describe("New page title"),
  childrenViewType: z
    .enum(["document", "bullet", "numbered"])
    .optional()
    .describe("How children are displayed (document, bullet, or numbered)"),
  mergePages: z
    .boolean()
    .optional()
    .describe(
      "If true, merge with existing page when renaming to a title that already exists (default: false)",
    ),
});

export const GetGuidelinesSchema = z.object({});

// Types derived from schemas
export type CreatePageParams = z.infer<typeof CreatePageSchema>;
export type GetPageParams = z.infer<typeof GetPageSchema>;
export type DeletePageParams = z.infer<typeof DeletePageSchema>;
export type UpdatePageParams = z.infer<typeof UpdatePageSchema>;

export async function createPage(
  client: RoamActionClient,
  params: CreatePageParams,
): Promise<CallToolResult> {
  const page: Record<string, unknown> = { title: params.title };
  if (params.uid !== undefined) page.uid = params.uid;
  if (params.childrenViewType !== undefined) page["children-view-type"] = params.childrenViewType;

  const response = await client.call<{ uid: string }>("data.page.fromMarkdown", [
    { page, "markdown-string": params.markdown },
  ]);
  return textResult(response.result ?? { uid: "" });
}

export async function getPage(
  client: RoamActionClient,
  params: GetPageParams,
): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = params.uid
    ? { uid: params.uid }
    : { title: params.title };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<GetPageResponse | undefined>("data.ai.getPage", [apiParams]);
  // Not-found: a found page always has a `uid`, so treat a nullish/uid-less result
  // (incl. `{}`) as a miss and return an explicit { found: false } signal — clearer
  // than an empty object that reads as a successful empty page.
  return textResult(response.result?.uid ? response.result : { found: false });
}

export async function deletePage(
  client: RoamActionClient,
  params: DeletePageParams,
): Promise<CallToolResult> {
  await client.call("data.page.delete", [{ page: { uid: params.uid } }]);
  return textResult({ success: true });
}

export async function updatePage(
  client: RoamActionClient,
  params: UpdatePageParams,
): Promise<CallToolResult> {
  const page: Record<string, unknown> = { uid: params.uid };
  if (params.title !== undefined) page.title = params.title;
  if (params.childrenViewType !== undefined) page["children-view-type"] = params.childrenViewType;

  const apiParams: Record<string, unknown> = { page };
  if (params.mergePages !== undefined) apiParams["merge-pages"] = params.mergePages;

  await client.call("data.page.update", [apiParams]);
  return textResult({ success: true });
}

export async function getGuidelines(client: RoamActionClient): Promise<CallToolResult> {
  const response = await client.call<{
    queriedAt?: string;
    guidelines: string | null;
    starredPages: string[];
    homepage: string | null;
    todaysDailyNotePage: string | null;
    aiUserDisplayName: string | null;
    aiUserDisplayPage: string | null;
    humanUserDisplayName: string | null;
  }>("data.ai.getGraphGuidelines", []);
  const result = response.result ?? {
    guidelines: null,
    starredPages: [],
    todaysDailyNotePage: null,
  };

  const dnpTitle = result.todaysDailyNotePage;
  // Lead with an explicit STOP so an agent re-reading this result mid-loop sees it:
  // orientation is done, do not call get_graph_guidelines again for this graph.
  // (ChatGPT otherwise re-orients before every read; the hosted transport's per-client
  // route profile carries the matching copy.)
  const stop =
    "You now have this graph's guidelines (the `graph` field below names the graph). Do NOT call get_graph_guidelines again for this graph this session; you already have everything you need. ";
  const nextSteps = dnpTitle
    ? `${stop}Next, read today's daily note page ("${dnpTitle}") with get_page (the user's primary workspace for the day). If you need more context, call search with an empty query for recently edited and viewed content. Skip the daily-note step only when the user has already given you a specific task to execute (e.g. "create a page called X").`
    : `${stop}Next, call search with an empty query to see recently edited and viewed content. Skip this only when the user has already given you a specific task to execute.`;

  return textResult({
    ...result,
    nextSteps,
  });
}
