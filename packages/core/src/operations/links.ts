import { z } from "zod";
import type { CallToolResult, RoamActionClient } from "../types.js";
import { textResult } from "../types.js";

// Link suggestion. Given a passage of text, the Local API's `data.ai.suggestLinks`
// action returns existing pages worth linking to (high-precision lexical + date
// matching against the graph). Renderer-only for now (no hosted-MCP counterpart),
// so it is registered as a desktopUiTool, like semantic_search.

export const SuggestLinksSchema = z.object({
  text: z.string().describe("The passage of text to find linkable existing pages in."),
  // .int().positive() enforces the public contract (a count of suggestions);
  // coercion kept because the CLI passes flag values as strings.
  maxResults: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of suggestions to return (default 20)."),
});

export type SuggestLinksParams = z.infer<typeof SuggestLinksSchema>;

export async function suggestLinks(
  client: RoamActionClient,
  params: SuggestLinksParams,
): Promise<CallToolResult> {
  // Single object arg. Omit maxResults when unset so the handler applies its default.
  const arg: { text: string; maxResults?: number } = { text: params.text };
  if (params.maxResults !== undefined) {
    arg.maxResults = params.maxResults;
  }
  const response = await client.call("data.ai.suggestLinks", [arg]);
  return textResult(response.result ?? { suggestions: [] });
}
