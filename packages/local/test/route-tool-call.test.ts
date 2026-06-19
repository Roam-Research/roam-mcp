import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted lets the spies be shared between the vi.mock factories (which are
// hoisted to the top of the file) and the test bodies below.
const { mockCallSpy, mockGetTokenInfoSpy, mockRoamClientCtor } = vi.hoisted(() => {
  const callSpy = vi.fn();
  const getTokenInfoSpy = vi.fn();
  return {
    mockCallSpy: callSpy,
    mockGetTokenInfoSpy: getTokenInfoSpy,
    mockRoamClientCtor: vi.fn().mockImplementation(() => ({
      call: callSpy,
      getTokenInfo: getTokenInfoSpy,
    })),
  };
});

vi.mock("../src/client.js", () => ({
  RoamClient: mockRoamClientCtor,
}));

vi.mock("../src/graph-resolver.js", () => ({
  // Used by local/src/tools.ts (defaultResolveGraph, defaultCreateClient, default updateTokenStatus)
  resolveGraph: vi.fn(),
  getPort: vi.fn(),
  updateGraphTokenStatus: vi.fn(),
  // Used by local/src/operations/graphs.ts (listGraphs + setupNewGraph)
  getConfiguredGraphs: vi.fn(),
  getConfiguredGraphsSafe: vi.fn(),
  saveGraphToConfig: vi.fn(),
}));

// Imports must come AFTER vi.mock so the mocks apply to local/tools.ts's transitive deps.
import { routeToolCall } from "../src/tools.js";
import {
  resolveGraph,
  getPort,
  updateGraphTokenStatus,
  getConfiguredGraphs,
} from "../src/graph-resolver.js";

afterEach(() => {
  vi.mocked(resolveGraph).mockReset();
  vi.mocked(getPort).mockReset();
  vi.mocked(updateGraphTokenStatus).mockReset();
  vi.mocked(getConfiguredGraphs).mockReset();
  mockCallSpy.mockReset();
  mockGetTokenInfoSpy.mockReset();
  mockRoamClientCtor.mockClear();
});

// ---------------------------------------------------------------------------
// Test B — backwards-compat: local routeToolCall(name, args) uses local defaults
// ---------------------------------------------------------------------------
// Guards the local path against future drift. The MCP and CLI packages call
// local's routeToolCall(name, args) positionally; that MUST keep using local
// resolveGraph, getPort, and a constructed RoamClient.
describe("local routeToolCall — backwards-compat", () => {
  it("falls back to local resolveGraph + RoamClient when no options given", async () => {
    vi.mocked(resolveGraph).mockResolvedValue({
      name: "default-graph",
      type: "hosted",
      token: "roam-graph-local-token-fake",
      nickname: "default",
    });
    vi.mocked(getPort).mockResolvedValue(3333);
    mockCallSpy.mockResolvedValue({
      success: true,
      result: { uid: "abc", markdown: "fallback markdown", queriedAt: "2026-01-01" },
    });
    mockGetTokenInfoSpy.mockResolvedValue({ status: "unknown" });

    const result = await routeToolCall("get_page", { uid: "abc", graph: "x" });

    expect(resolveGraph).toHaveBeenCalledWith("x");
    expect(getPort).toHaveBeenCalled();
    expect(mockRoamClientCtor).toHaveBeenCalledWith({
      graphName: "default-graph",
      graphType: "hosted",
      token: "roam-graph-local-token-fake",
      port: 3333,
    });
    expect(mockCallSpy).toHaveBeenCalledWith("data.ai.getPage", expect.any(Array));
    expect(result.isError).toBeFalsy();

    const text = (result.content[0] as { text: string }).text;
    // the caller's `graph` arg ("x") is echoed, not the canonical resolved name
    expect(JSON.parse(text).graph).toBe("x");
    expect(text).toContain("fallback markdown");
  });
});

// ---------------------------------------------------------------------------
// Test D — local standalone dispatch (list_graphs flows through local, not core)
// ---------------------------------------------------------------------------
// Core's routeToolCall doesn't know about list_graphs (it's local-only). If
// local's wrapper incorrectly delegated to core, core would throw "Unknown
// tool: list_graphs". This test confirms local intercepts standalone tools.
describe("local routeToolCall — standalone dispatch", () => {
  it("dispatches list_graphs through the local standalone path", async () => {
    vi.mocked(getConfiguredGraphs).mockResolvedValue([
      { nickname: "alpha", name: "alpha-graph", accessLevel: "full" },
      { nickname: "beta", name: "beta-graph", accessLevel: "read-only" },
    ]);

    const result = await routeToolCall("list_graphs", {});

    // The default listGraphs action calls getConfiguredGraphs once.
    expect(getConfiguredGraphs).toHaveBeenCalled();
    // Importantly, NO local-default RoamClient construction or resolveGraph call —
    // standalone tools don't go through the client-tool dispatch.
    expect(mockRoamClientCtor).not.toHaveBeenCalled();
    expect(resolveGraph).not.toHaveBeenCalled();
    // Result should reference the configured graphs.
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("alpha");
    expect(text).toContain("beta");
  });

  it("standaloneHandlers override beats the default action", async () => {
    const customHandler = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "custom-handler-result" }],
    });

    const result = await routeToolCall(
      "list_graphs",
      {},
      { standaloneHandlers: { list_graphs: customHandler } },
    );

    expect(customHandler).toHaveBeenCalled();
    expect(getConfiguredGraphs).not.toHaveBeenCalled();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe("custom-handler-result");
  });
});

// ---------------------------------------------------------------------------
// Tests E + F — get_graph_guidelines local-sync side flow
// ---------------------------------------------------------------------------
// The most user-visible local behavior: token revocation detection, accessLevel
// sync to ~/.roam-tools.json, and result enrichment with grantedScopes.
// Exercised via the default tokenInfoMode ("local-sync") that local's wrapper
// passes when no third arg is given.
describe("local routeToolCall — get_graph_guidelines local-sync side flow", () => {
  it("Test E: active token with stale accessLevel triggers a config update + result enrichment", async () => {
    vi.mocked(resolveGraph).mockResolvedValue({
      name: "test-graph",
      type: "hosted",
      token: "roam-graph-local-token-fake",
      nickname: "test",
      accessLevel: "read-only",
      lastKnownTokenStatus: "active",
    });
    vi.mocked(getPort).mockResolvedValue(3333);
    mockCallSpy.mockResolvedValue({
      success: true,
      result: {
        guidelines: "be nice",
        starredPages: [],
        todaysDailyNotePage: null,
      },
    });
    mockGetTokenInfoSpy.mockResolvedValue({
      status: "active",
      info: {
        success: true,
        grantedAccessLevel: "read-append",
        grantedScopes: { read: true, append: true, edit: false },
      },
    });

    const result = await routeToolCall("get_graph_guidelines", { graph: "test" });

    // Side flow ran
    expect(mockGetTokenInfoSpy).toHaveBeenCalled();
    // accessLevel changed (read-only → read-append) so config was rewritten
    expect(updateGraphTokenStatus).toHaveBeenCalledWith("test", {
      accessLevel: "read-append",
      lastKnownTokenStatus: "active",
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    // graph field from withGraphField — echoes the caller's identifier ("test"), not the canonical name
    expect(JSON.parse(text).graph).toBe("test");
    // Result enriched by enrichResultWithTokenInfo
    expect(text).toContain('"accessLevel": "read-append"');
    expect(text).toContain('"scopes"');
  });

  it("Test F: revoked token updates lastKnownTokenStatus and prepends a warning", async () => {
    vi.mocked(resolveGraph).mockResolvedValue({
      name: "test-graph",
      type: "hosted",
      token: "roam-graph-local-token-fake",
      nickname: "test",
      accessLevel: "full",
      lastKnownTokenStatus: "active",
    });
    vi.mocked(getPort).mockResolvedValue(3333);
    mockCallSpy.mockResolvedValue({
      success: true,
      result: {
        guidelines: "be nice",
        starredPages: [],
        todaysDailyNotePage: null,
      },
    });
    mockGetTokenInfoSpy.mockResolvedValue({ status: "revoked" });

    const result = await routeToolCall("get_graph_guidelines", { graph: "test" });

    expect(mockGetTokenInfoSpy).toHaveBeenCalled();
    // Status flipped from active → revoked, so the config was patched
    expect(updateGraphTokenStatus).toHaveBeenCalledWith("test", {
      lastKnownTokenStatus: "revoked",
    });

    const text = (result.content[0] as { text: string }).text;
    // enrichResultWithTokenStatus prepends a fixed warning prefix
    expect(text).toContain("WARNING: The token for this graph has been revoked.");
    expect(text).toContain("Roam graph: test");
  });
});
