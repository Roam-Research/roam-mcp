import { describe, expect, it } from "vitest";
import { dataTools, desktopUiTools } from "../src/tools.js";

// The hosted MCP registers ONLY dataTools, so this list IS the hosted surface.
// It is pinned by exact name so that promoting a local-only tool (or adding a
// new data tool) is always a deliberate, visible act — a length check alone
// (previously the only guard) silently absorbs accidental leaks. This matters
// most for tools that must never reach the hosted transport, e.g.
// call_extension_tool (runs arbitrary extension handler code; the hosted
// backend serves from a peer replica with no channel to a live client).
// Since 2026-08-14 the hosted server (on core 0.10.0) mirrors this list as its
// own hand-written fixture — deliberately not derived from core, so neither pin
// is tautological — asserted both consumer-side and against a real tools/list on
// every route. It pins core exactly, so a change here never reaches them on its
// own: a deliberate surface change becomes a required edit in their upgrade diff,
// and an accidental one shows up there as a failure when they next bump.
// If this test fails because you intentionally changed the surface, update the
// list here AND check docs/architecture.md §2 + the hosted consumer's fixture
// (their upgrade diff is where that edit has to happen — see §6).
const HOSTED_SURFACE = [
  "add_comment",
  "append_to_daily_note",
  "create_block",
  "create_page",
  "datalog_query",
  "delete_block",
  "delete_page",
  "get_backlinks",
  "get_block",
  "get_comments",
  "get_graph_guidelines",
  "get_page",
  "move_block",
  "roam_query",
  "search",
  "search_templates",
  "update_block",
  "update_page",
];

describe("hosted surface (dataTools) is exactly the pinned name list", () => {
  it("dataTools matches the pinned hosted surface", () => {
    expect(dataTools.map((t) => t.name).sort()).toEqual(HOSTED_SURFACE);
  });

  it("no tool is registered in both dataTools and desktopUiTools", () => {
    const hosted = new Set(dataTools.map((t) => t.name));
    const overlap = desktopUiTools.map((t) => t.name).filter((n) => hosted.has(n));
    expect(overlap).toEqual([]);
  });

  it("call_extension_tool is local-only (desktopUiTools, never the hosted surface)", () => {
    expect(HOSTED_SURFACE).not.toContain("call_extension_tool");
    expect(desktopUiTools.map((t) => t.name)).toContain("call_extension_tool");
  });
});
