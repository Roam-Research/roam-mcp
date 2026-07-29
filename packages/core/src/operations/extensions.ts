import { z } from "zod";
import type { CallToolResult, RoamActionClient } from "../types.js";
import { textResult, RoamError, ErrorCodes } from "../types.js";

// Developer-extension management and extension-registered AI tools. Local Roam
// Desktop only: extensions exist in the running desktop app, so these are
// renderer-only Local API actions (`depot.reloadDeveloperExtensions`,
// `data.ai.callExtensionTool`) with no hosted-MCP counterpart — registered as
// desktopUiTools, like semantic_search. See docs/architecture.md.

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

export const CallExtensionToolSchema = z.object({
  tool: z
    .string()
    .describe(
      "Tool id, exactly as listed in get_graph_guidelines' extensionTools (opaque — never construct or modify it)",
    ),
  args: z
    .record(z.unknown())
    .optional()
    .describe(
      "Arguments for the tool, matching the inputSchema advertised in its extensionTools entry (JSON object on the CLI)",
    ),
});

export type CallExtensionToolParams = z.infer<typeof CallExtensionToolSchema>;

// Shape of the Local API's `data.ai.callExtensionTool` result. `result` is the
// tool handler's JSON-serializable return value, passed through untouched.
interface CallExtensionToolResult {
  tool: string;
  result: unknown;
  queriedAt: string;
}

export async function callExtensionTool(
  client: RoamActionClient,
  params: CallExtensionToolParams,
): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = { tool: params.tool };
  if (params.args !== undefined) apiParams.args = params.args;

  // Three error classes arrive as ordinary Local API 500s whose messages are
  // deliberately written for model self-correction: unknown tool (lists the
  // currently available ids), args/inputSchema mismatch (names the violations;
  // validation is renderer-side — never add a validator here), and handler
  // failure. NOTE the local client rewraps every 500 as "Server error: <message>"
  // with code INTERNAL_ERROR (client.ts handleApiError), so the guidance TEXT
  // reaches the model but the error class does not — don't claim or rely on
  // verbatim pass-through. (No test currently pins that non-404 errors exit
  // this catch unchanged; if you touch the catch, keep them flowing through.)
  try {
    const response = await client.call<CallExtensionToolResult>("data.ai.callExtensionTool", [
      apiParams,
    ]);
    return textResult(response.result ?? {});
  } catch (error) {
    // An app build without the feature has no such action. The API-version gate
    // can't detect this (the feature shipped as a patch revision, and the gate
    // ignores patch), so the raw UNKNOWN_ACTION is the only signal — turn it
    // into actionable advice instead of "Unknown API action".
    if (error instanceof RoamError && error.code === ErrorCodes.UNKNOWN_ACTION) {
      throw new RoamError(
        "This Roam Desktop build doesn't support extension AI tools yet. Update Roam Desktop to a current build to use call_extension_tool.",
        ErrorCodes.UNKNOWN_ACTION,
      );
    }
    throw error;
  }
}
