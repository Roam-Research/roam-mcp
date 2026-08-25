import { z } from "zod";
import type { CallToolResult, RoamActionClient } from "../types.js";
import { successResult } from "../types.js";

// Left-sidebar "Shortcuts" management. These are graph data (the shortcut list is
// stored in the graph — which is why get_graph_guidelines can already return
// `starredPages`), so the operations are transport-neutral `client.call(...)`s.
// They are registered as *desktopUiTools* (local-only) for now, not dataTools,
// because the hosted MCP backend has not been confirmed to expose the underlying
// `data.page.addShortcut` / `removeShortcut` actions. Promote them to dataTools
// once it does. See docs/architecture.md §2d/§6.

// Schemas
export const AddShortcutSchema = z.object({
  uid: z.string().describe("UID of the page to add to the left sidebar shortcuts"),
  // .int().nonnegative() enforces the documented contract: the description promises a
  // 0-based index. (Roam's preprocessor rejects fractions and clamps negatives, so loose
  // values wouldn't corrupt anything — but they'd silently diverge from what was asked.)
  index: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "0-based position in the shortcuts list. Omit to append at the end. Passing an index for an already-shortcutted page moves it to that position.",
    ),
});

export const RemoveShortcutSchema = z.object({
  uid: z.string().describe("UID of the page to remove from the left sidebar shortcuts"),
});

// Types derived from schemas
export type AddShortcutParams = z.infer<typeof AddShortcutSchema>;
export type RemoveShortcutParams = z.infer<typeof RemoveShortcutSchema>;

export async function addShortcut(
  client: RoamActionClient,
  params: AddShortcutParams,
): Promise<CallToolResult> {
  // Positional args, mirroring roamAlphaAPI.data.page.addShortcut(uid, index):
  // the local API spreads the args array as the function's positional arguments,
  // so this action does NOT take the `{ page: { uid } }` wrapper that
  // data.page.delete/update use. Verified against the live local API.
  const args = params.index !== undefined ? [params.uid, params.index] : [params.uid];
  const response = await client.call("data.page.addShortcut", args);
  return successResult(response.result);
}

export async function removeShortcut(
  client: RoamActionClient,
  params: RemoveShortcutParams,
): Promise<CallToolResult> {
  // Positional, mirroring roamAlphaAPI.data.page.removeShortcut(uid).
  const response = await client.call("data.page.removeShortcut", [params.uid]);
  return successResult(response.result);
}
