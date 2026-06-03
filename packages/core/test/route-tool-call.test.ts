import { describe, expect, it, vi } from "vitest";
import { routeToolCall } from "../src/tools.js";

// Core's routeToolCall has no defaults — it requires resolveGraph + createClient
// in every call. These tests verify the contract that hosted MCP transports
// rely on. The local-defaults wrapper
// is tested in @roam-research/roam-tools-local's own test file.

// ---------------------------------------------------------------------------
// Test A — injection contract (the load-bearing test for hosted MCP)
// ---------------------------------------------------------------------------
describe("routeToolCall — injection contract", () => {
  it("uses injected resolveGraph + createClient and skips token-info sync", async () => {
    let createClientCalled = false;
    let observedAction: string | undefined;

    const result = await routeToolCall(
      "get_page",
      { uid: "abc", graph: "test" },
      {
        resolveGraph: async () => ({
          name: "test-graph",
          type: "hosted",
          nickname: "test",
        }),
        createClient: () => {
          createClientCalled = true;
          return {
            call: async (action: string) => {
              observedAction = action;
              return {
                success: true,
                result: {
                  uid: "abc",
                  markdown: "fake markdown content",
                  queriedAt: "2026-01-01T00:00:00Z",
                  // a backend-provided `graph` must NOT win over the canonical resolved name
                  graph: "spoofed",
                },
              };
            },
          };
        },
        tokenInfoMode: "skip",
      },
    );

    expect(createClientCalled).toBe(true);
    expect(observedAction).toBe("data.ai.getPage");
    expect(result.isError).toBeFalsy();

    const first = result.content[0];
    expect(first.type).toBe("text");
    const text = (first as { text: string }).text;
    // canonical resolved name wins over the backend's `graph: "spoofed"`
    expect(JSON.parse(text).graph).toBe("test-graph");
    expect(text).toContain("fake markdown content");
  });
});

// ---------------------------------------------------------------------------
// Test C — tokenInfoMode: "skip" really skips the get_graph_guidelines side flow
// ---------------------------------------------------------------------------
// Crucially, the injected client *does* implement getTokenInfo — this proves
// the gating fires on the mode, not on method absence.
describe("routeToolCall — get_graph_guidelines with tokenInfoMode: 'skip'", () => {
  it("skips getTokenInfo and onTokenStatusUpdate even when both are provided", async () => {
    const getTokenInfoSpy = vi.fn().mockResolvedValue({
      status: "active",
      info: { success: true, grantedAccessLevel: "full" },
    });
    const callSpy = vi.fn().mockResolvedValue({
      success: true,
      result: {
        guidelines: "do nice things",
        starredPages: [],
        todaysDailyNotePage: null,
      },
    });
    const onTokenStatusUpdate = vi.fn().mockResolvedValue(undefined);

    const result = await routeToolCall(
      "get_graph_guidelines",
      { graph: "test" },
      {
        resolveGraph: async () => ({ name: "test-graph", type: "hosted", nickname: "test" }),
        createClient: () => ({ call: callSpy, getTokenInfo: getTokenInfoSpy }),
        tokenInfoMode: "skip",
        onTokenStatusUpdate,
      },
    );

    // Action ran
    expect(callSpy).toHaveBeenCalledWith("data.ai.getGraphGuidelines", []);
    // Side flow was skipped
    expect(getTokenInfoSpy).not.toHaveBeenCalled();
    expect(onTokenStatusUpdate).not.toHaveBeenCalled();
    // graph field still applies (documented behavior)
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(JSON.parse(text).graph).toBe("test-graph");
    expect(text).toContain("do nice things");
  });
});

// ---------------------------------------------------------------------------
// Test D — get_page / get_block treat an empty/uid-less result as not-found
// ---------------------------------------------------------------------------
// A miss must yield { found: false } even when the backend returns `{}` (not just
// null/undefined) — a found page/block always carries a `uid`.
describe("routeToolCall — get_page / get_block not-found", () => {
  it.each(["get_page", "get_block"])(
    "%s returns { found: false } for an empty result",
    async (tool) => {
      const result = await routeToolCall(
        tool,
        { uid: "missing", graph: "test" },
        {
          resolveGraph: async () => ({ name: "test-graph", type: "hosted", nickname: "test" }),
          createClient: () => ({ call: async () => ({ success: true, result: {} }) }),
          tokenInfoMode: "skip",
        },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.found).toBe(false);
      expect(parsed.uid).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// Test E — create_block resolves a relative dailyNotePage via getCurrentDate
// ---------------------------------------------------------------------------
// Proves the seam: a relative word ("today") is resolved to a concrete
// MM-DD-YYYY using the transport's getCurrentDate(), and the backend sees only
// the resolved date on the wire.
describe("routeToolCall — create_block relative dailyNotePage", () => {
  it("resolves 'today' to MM-DD-YYYY using client.getCurrentDate", async () => {
    const callSpy = vi.fn().mockResolvedValue({ success: true, result: { uids: ["abc"] } });

    const result = await routeToolCall(
      "create_block",
      { dailyNotePage: "today", markdown: "hello", graph: "test" },
      {
        resolveGraph: async () => ({ name: "test-graph", type: "hosted", nickname: "test" }),
        createClient: () => ({ call: callSpy, getCurrentDate: () => "2026-03-17" }),
        tokenInfoMode: "skip",
      },
    );

    expect(result.isError).toBeFalsy();
    expect(callSpy).toHaveBeenCalledTimes(1);
    const [action, args] = callSpy.mock.calls[0];
    expect(action).toBe("data.block.fromMarkdown");
    const body = (args as unknown[])[0] as { location: Record<string, unknown> };
    expect(body.location["page-title"]).toEqual({ "daily-note-page": "03-17-2026" });
  });
});
