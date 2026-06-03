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
    expect(text.startsWith("Roam graph: test")).toBe(true);
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
    // Graph-name prefix still applies (documented behavior)
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text.startsWith("Roam graph: test")).toBe(true);
    expect(text).toContain("do nice things");
    // The built-in roam-syntax guide is appended to every get_graph_guidelines response.
    expect(text).toContain("Use the graph");
  });
});
