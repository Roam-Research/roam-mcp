import { describe, expect, it, vi } from "vitest";
import { findTool, routeToolCall } from "../src/tools.js";
import { RoamError, ErrorCodes } from "../src/types.js";

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
                  // a backend-provided `graph` must NOT win over the caller's echoed identifier
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
    // the caller's identifier ("test", a nickname here) is echoed, and wins over `graph: "spoofed"`
    expect(JSON.parse(text).graph).toBe("test");
    expect(text).toContain("fake markdown content");
  });

  it("falls back to the canonical resolved name when the caller passes no graph arg", async () => {
    const result = await routeToolCall(
      "get_page",
      { uid: "abc" }, // no graph arg — nothing to echo
      {
        resolveGraph: async () => ({ name: "only-graph", type: "hosted", nickname: "only" }),
        createClient: () => ({
          call: async () => ({
            success: true,
            result: { uid: "abc", markdown: "body" },
          }),
        }),
        tokenInfoMode: "skip",
      },
    );

    const text = (result.content[0] as { text: string }).text;
    // no caller identifier to echo, so the canonical resolved name is used
    expect(JSON.parse(text).graph).toBe("only-graph");
  });

  // structuredContent is a separate branch of withGraphField from the text
  // channel covered above, and it is the channel a schema-validating client
  // (e.g. ChatGPT) checks against its cached tools/list. An echoed nickname
  // must land there AND still satisfy the tool's declared outputSchema.
  it("echoes into a write tool's structuredContent without breaking its outputSchema", async () => {
    const result = await routeToolCall(
      "create_page",
      { title: "Notes", markdown: "hi", graph: "work" },
      {
        resolveGraph: async () => ({ name: "acme-corp-notes", type: "hosted", nickname: "work" }),
        createClient: () => ({
          // the backend's own `graph` must lose here too, not just in the text body
          call: async () => ({ success: true, result: { uid: "page-1", graph: "spoofed" } }),
        }),
        tokenInfoMode: "skip",
      },
    );

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ uid: "page-1", graph: "work" });

    // Assert on `.data`, not just `.success`: `.success` never inspects the payload, so
    // on its own it would not show that `graph` is present in the validated output. (It
    // survives because `graph` is a declared key on the preset, not because of
    // `.passthrough()` — unknown-key survival is pinned in tool-output-schema.test.ts.)
    const tool = findTool("create_page");
    expect(tool?.outputSchema).toBeDefined();
    const validated = tool!.outputSchema!.safeParse(result.structuredContent);
    expect(validated.success).toBe(true);
    expect(validated.success && validated.data).toMatchObject({ uid: "page-1", graph: "work" });
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
    // graph field still applies (documented behavior), echoing the caller's identifier
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(JSON.parse(text).graph).toBe("test");
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

// ---------------------------------------------------------------------------
// Test F — append_to_daily_note defaults to today and maps nestUnder/order
// ---------------------------------------------------------------------------
// With no `date`, it targets today's daily note (resolved via getCurrentDate),
// appends at the end, and routes `nestUnder` to the backend's nest-under-str —
// all through the same data.block.fromMarkdown action create_block uses.
describe("routeToolCall — append_to_daily_note", () => {
  it("defaults the date to today and maps nestUnder/order", async () => {
    const callSpy = vi.fn().mockResolvedValue({ success: true, result: { uids: ["abc"] } });

    const result = await routeToolCall(
      "append_to_daily_note",
      { markdown: "buy milk", nestUnder: "TODOs", graph: "test" },
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
    const body = (args as unknown[])[0] as {
      location: Record<string, unknown>;
      "markdown-string": string;
    };
    expect(body.location["page-title"]).toEqual({ "daily-note-page": "03-17-2026" });
    expect(body.location["nest-under-str"]).toBe("TODOs");
    expect(body.location.order).toBe("last");
    expect(body["markdown-string"]).toBe("buy milk");
  });
});

// ---------------------------------------------------------------------------
// Test G — call_extension_tool wire contract
// ---------------------------------------------------------------------------
// The tool id is opaque (qualified "<extension-id>/<name>" or bare "<name>") and
// must pass through verbatim; `args` keys are the extension's own schema and must
// be forwarded untouched, but the key must be absent from the wire when the
// caller omits it.
describe("routeToolCall — call_extension_tool", () => {
  it("passes {tool, args} as the single object arg and returns the result verbatim", async () => {
    const callSpy = vi.fn().mockResolvedValue({
      success: true,
      result: {
        tool: "my-ext/make-card",
        result: { created: true },
        queriedAt: "2026-07-23T00:00:00Z",
      },
    });

    const result = await routeToolCall(
      "call_extension_tool",
      { tool: "my-ext/make-card", args: { front: "hi", "block/uid": "abc" }, graph: "test" },
      {
        resolveGraph: async () => ({ name: "test-graph", type: "offline", nickname: "test" }),
        createClient: () => ({ call: callSpy }),
        tokenInfoMode: "skip",
      },
    );

    expect(result.isError).toBeFalsy();
    expect(callSpy).toHaveBeenCalledWith("data.ai.callExtensionTool", [
      { tool: "my-ext/make-card", args: { front: "hi", "block/uid": "abc" } },
    ]);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.tool).toBe("my-ext/make-card");
    expect(parsed.result).toEqual({ created: true });
  });

  it("omits the args key from the wire entirely when the caller passes none", async () => {
    const callSpy = vi.fn().mockResolvedValue({
      success: true,
      result: { tool: "graph-stats", result: { pages: 1 }, queriedAt: "2026-07-23T00:00:00Z" },
    });

    await routeToolCall(
      "call_extension_tool",
      { tool: "graph-stats", graph: "test" },
      {
        resolveGraph: async () => ({ name: "test-graph", type: "offline", nickname: "test" }),
        createClient: () => ({ call: callSpy }),
        tokenInfoMode: "skip",
      },
    );

    const [, wireArgs] = callSpy.mock.calls[0];
    expect((wireArgs as unknown[])[0]).toEqual({ tool: "graph-stats" });
    expect(Object.keys((wireArgs as unknown[])[0] as object)).not.toContain("args");
  });

  // The feature shipped as an API patch revision, so the major.minor version
  // gate can't flag a desktop build that predates it — the raw UNKNOWN_ACTION
  // ("Unknown API action") is the only signal, and it must become actionable
  // advice rather than reach the model as-is.
  it("maps UNKNOWN_ACTION from a pre-feature app build to an update-Roam message", async () => {
    const result = await routeToolCall(
      "call_extension_tool",
      { tool: "graph-stats", graph: "test" },
      {
        resolveGraph: async () => ({ name: "test-graph", type: "offline", nickname: "test" }),
        createClient: () => ({
          call: async () => {
            throw new RoamError(
              "Unknown API action: API action not found: data.ai.callExtensionTool",
              ErrorCodes.UNKNOWN_ACTION,
            );
          },
        }),
        tokenInfoMode: "skip",
      },
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.error.code).toBe(ErrorCodes.UNKNOWN_ACTION);
    expect(parsed.error.message).toContain("Update Roam Desktop");
    expect(parsed.error.message).not.toContain("Unknown API action");
  });
});

// ---------------------------------------------------------------------------
// Test H — get_graph_guidelines passes extensionTools through
// ---------------------------------------------------------------------------
// The local backend includes extensionTools only when tools are registered;
// when present it must survive to the output (with nextSteps pointing at
// call_extension_tool), and when absent nothing may fabricate it.
describe("routeToolCall — get_graph_guidelines extensionTools passthrough", () => {
  const baseGuidelines = {
    guidelines: null,
    starredPages: [],
    todaysDailyNotePage: null,
  };
  const options = (result: Record<string, unknown>) => ({
    resolveGraph: async () => ({
      name: "test-graph",
      type: "offline" as const,
      nickname: "test",
    }),
    createClient: () => ({ call: async () => ({ success: true, result }) }),
    tokenInfoMode: "skip" as const,
  });

  it("surfaces extensionTools and points nextSteps at call_extension_tool", async () => {
    const extensionTools = [
      { tool: "graph-stats", description: "Counts pages and blocks", scope: "read" },
    ];
    const result = await routeToolCall(
      "get_graph_guidelines",
      { graph: "test" },
      options({ ...baseGuidelines, extensionTools }),
    );

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.extensionTools).toEqual(extensionTools);
    expect(parsed.nextSteps).toContain("call_extension_tool");
  });

  it("omits extensionTools and the pointer when the backend sends none", async () => {
    const result = await routeToolCall(
      "get_graph_guidelines",
      { graph: "test" },
      options(baseGuidelines),
    );

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).not.toHaveProperty("extensionTools");
    expect(parsed.nextSteps).not.toContain("call_extension_tool");
  });
});
