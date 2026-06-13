import { describe, expect, it } from "vitest";
import { dataTools, getDataTools } from "../src/tools.js";

// getDataTools is the seam the hosted (ChatGPT) transport uses to drop the
// trailing "call get_graph_guidelines" nudge from each data-tool description in
// tools/list. It must be a pure, opt-in transform: the default path returns the
// shared `dataTools` untouched (local CLI/MCP keep the nudge), and the strip path
// must never mutate the shared array. These tests pin that contract.

// The suffix every nudged tool carries (mirrors GUIDELINES_NOTE in tools.ts). We
// don't import the const (it's intentionally private); we assert structurally.
const NUDGE = "call get_graph_guidelines";

// get_graph_guidelines is the one data tool that never carries the nudge (you
// don't tell it to call itself) — so the endsWith guard must pass it through.
const carriers = dataTools.filter((t) => t.description.includes(NUDGE));
const nonCarriers = dataTools.filter((t) => !t.description.includes(NUDGE));

describe("getDataTools — default (note preserved)", () => {
  it("returns the shared dataTools reference with no copy", () => {
    expect(getDataTools()).toBe(dataTools);
    expect(getDataTools({})).toBe(dataTools);
    expect(getDataTools({ omitGuidelinesNoteSuffix: false })).toBe(dataTools);
  });

  it("every data tool but get_graph_guidelines carries the nudge", () => {
    expect(carriers.length).toBeGreaterThan(0);
    expect(nonCarriers.map((t) => t.name)).toEqual(["get_graph_guidelines"]);
  });
});

describe("getDataTools — omitGuidelinesNoteSuffix", () => {
  const stripped = getDataTools({ omitGuidelinesNoteSuffix: true });
  const pair = (name: string) => {
    const i = dataTools.findIndex((t) => t.name === name);
    return { before: dataTools[i], after: stripped[i] };
  };

  it("removes the nudge from every description", () => {
    expect(stripped).toHaveLength(dataTools.length);
    for (const t of stripped) expect(t.description, t.name).not.toContain(NUDGE);
  });

  it("strips carriers into fresh objects, preserving non-description fields by reference", () => {
    for (const c of carriers) {
      const { before, after } = pair(c.name);
      expect(after, c.name).not.toBe(before);
      // Stripped description is the original minus the nudge block specifically —
      // assert the removed tail IS the nudge, so a wrong block can't slip through.
      expect(before.description.startsWith(after.description), c.name).toBe(true);
      expect(after.description.length, c.name).toBeLessThan(before.description.length);
      expect(before.description.slice(after.description.length), c.name).toContain(NUDGE);
      expect(after.name).toBe(before.name);
      expect(after.action).toBe(before.action);
      expect(after.schema).toBe(before.schema);
      expect(after.annotations).toBe(before.annotations);
      expect(after.outputSchema).toBe(before.outputSchema);
    }
  });

  it("passes non-carriers through as the same reference (endsWith guard)", () => {
    for (const nc of nonCarriers) {
      const { before, after } = pair(nc.name);
      expect(after, nc.name).toBe(before);
    }
  });

  it("does not mutate the shared dataTools", () => {
    for (const c of carriers) expect(c.description, c.name).toContain(NUDGE);
  });
});
