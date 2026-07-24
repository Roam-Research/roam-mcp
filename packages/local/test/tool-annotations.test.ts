import { describe, expect, it } from "vitest";
import { graphManagementTools, tools, findTool } from "../src/tools.js";

// The local standalones are annotated here (not in core) because they touch
// local config + the Desktop API. The load-bearing case is setup_new_graph:
// unlike the hosted no-op redirect, the local one requests a token and writes
// ~/.roam-tools.json, so it must NOT be labeled read-only.

describe("local standalone annotations", () => {
  it("list_graphs is read-only", () => {
    const a = findTool("list_graphs")?.annotations;
    expect(a?.readOnlyHint).toBe(true);
    expect(a?.openWorldHint).toBe(false);
  });

  it("setup_new_graph is a write (NOT read-only) — it grants a token + writes config", () => {
    const a = findTool("setup_new_graph")?.annotations;
    expect(a?.readOnlyHint).toBe(false);
    expect(a?.destructiveHint).toBe(false);
    expect(a?.openWorldHint).toBe(false);
  });

  it("both standalones carry annotations + a title", () => {
    for (const tool of graphManagementTools) {
      expect(tool.annotations, `${tool.name} annotations`).toBeDefined();
      expect(typeof tool.title, `${tool.name} title`).toBe("string");
    }
  });

  it("every tool in the combined local registry is annotated (core forwarded + local)", () => {
    // file_upload (server-side fetch of an arbitrary URL) and call_extension_tool
    // (arbitrary extension handler code) are the open-world tools.
    const openWorld = new Set(["file_upload", "call_extension_tool"]);
    for (const tool of tools) {
      expect(tool.annotations, `${tool.name} annotations`).toBeDefined();
      expect(tool.annotations?.openWorldHint, tool.name).toBe(openWorld.has(tool.name));
    }
  });
});
