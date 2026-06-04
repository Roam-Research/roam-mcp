import { describe, expect, it } from "vitest";
import { tools, findTool, type ToolDefinition } from "../src/tools.js";

// These labels are load-bearing: ChatGPT (and other MCP clients) gate tools by
// their annotations, and an omitted annotation defaults to destructive +
// open-world. This suite pins the classification so a future edit can't silently
// drop or flip a hint.

function annotationsFor(name: string) {
  const tool = findTool(name);
  expect(tool, `tool ${name} should exist`).toBeDefined();
  return (tool as ToolDefinition).annotations;
}

describe("tool annotations — representative tools per category", () => {
  it("reads are read-only and non-destructive", () => {
    for (const name of [
      "get_page",
      "get_block",
      "search",
      "datalog_query",
      "get_graph_guidelines",
      "file_get",
    ]) {
      const a = annotationsFor(name);
      expect(a?.readOnlyHint, name).toBe(true);
      expect(a?.destructiveHint, name).toBe(false);
    }
  });

  it("appends are writes but not destructive", () => {
    for (const name of ["create_block", "append_to_daily_note", "create_page", "add_comment"]) {
      const a = annotationsFor(name);
      expect(a?.readOnlyHint, name).toBe(false);
      expect(a?.destructiveHint, name).toBe(false);
    }
  });

  it("edits and moves are destructive (overwrite/relocate) but idempotent", () => {
    for (const name of ["update_block", "update_page", "move_block"]) {
      const a = annotationsFor(name);
      expect(a?.readOnlyHint, name).toBe(false);
      expect(a?.destructiveHint, name).toBe(true);
      expect(a?.idempotentHint, name).toBe(true);
    }
  });

  it("deletes are destructive and non-idempotent", () => {
    for (const name of ["delete_block", "delete_page", "file_delete"]) {
      const a = annotationsFor(name);
      expect(a?.destructiveHint, name).toBe(true);
      expect(a?.idempotentHint, name).toBe(false);
    }
  });

  it("nav tools change view state (not read-only) but are non-destructive", () => {
    for (const name of ["open_main_window", "open_sidebar"]) {
      const a = annotationsFor(name);
      expect(a?.readOnlyHint, name).toBe(false);
      expect(a?.destructiveHint, name).toBe(false);
    }
    // open_main_window navigates/replaces the view (idempotent); open_sidebar
    // calls addWindow, which can add another pane on repeat (not idempotent).
    expect(annotationsFor("open_main_window")?.idempotentHint).toBe(true);
    expect(annotationsFor("open_sidebar")?.idempotentHint).toBe(false);
  });

  it("file_upload is the one open-world tool (server-side fetch of an arbitrary URL)", () => {
    const a = annotationsFor("file_upload");
    expect(a?.readOnlyHint).toBe(false);
    expect(a?.destructiveHint).toBe(false);
    expect(a?.openWorldHint).toBe(true);
  });
});

describe("tool annotations — invariants across all core tools", () => {
  it("every core tool carries annotations and a title", () => {
    for (const tool of tools) {
      expect(tool.annotations, `${tool.name} annotations`).toBeDefined();
      expect(typeof tool.title, `${tool.name} title`).toBe("string");
    }
  });

  it("openWorldHint is false for every tool except file_upload", () => {
    for (const tool of tools) {
      const expected = tool.name === "file_upload";
      expect(tool.annotations?.openWorldHint, tool.name).toBe(expected);
    }
  });
});
