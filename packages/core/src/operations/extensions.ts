import { z } from "zod";
import type { CallToolResult, RoamActionClient } from "../types.js";
import { textResult } from "../types.js";

// Developer-extension management. Local Roam Desktop only: developer-mode
// extensions exist in the running desktop app, so this is a renderer-only Local
// API action (`depot.reloadDeveloperExtensions`) with no hosted-MCP counterpart —
// registered as a desktopUiTool, like semantic_search. See docs/architecture.md.

// No parameters — reloads every developer extension currently loaded.
export const ReloadDevExtensionsSchema = z.object({});

// Shape of the Local API's `depot.reloadDeveloperExtensions` result.
interface ReloadDevExtensionsResult {
  reloaded: { id: string; name: string }[];
}

export async function reloadDevExtensions(client: RoamActionClient): Promise<CallToolResult> {
  // No args — the handler unloads then re-loads each developer extension and
  // resolves to the list of what was reloaded.
  const response = await client.call<ReloadDevExtensionsResult>(
    "depot.reloadDeveloperExtensions",
    [],
  );
  return textResult({ reloaded: response.result?.reloaded ?? [] });
}
