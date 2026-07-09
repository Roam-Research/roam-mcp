import { describe, expect, it, vi } from "vitest";
import { GraphConfigSchema } from "../src/types.js";
import { routeToolCall } from "../src/tools.js";

// `read-edit-own` (read + append + edit/delete only the agent's own content) was
// added to AccessLevel in 0.7.4. It is carried, not enforced, in core — but two
// places must accept it or a server-granted token silently corrupts config:
//
//   1. GraphConfigSchema — connect.ts and setup_new_graph cast the backend's
//      `grantedAccessLevel` straight into ~/.roam-tools.json without going
//      through routeToolCall's validLevels guard. If the enum rejected the
//      value, the next config read would throw and brick every tool call.
//   2. routeToolCall's validLevels — an unrecognized level is dropped rather
//      than persisted, so the guard has to know about each real tier.
//
// These tests pin both. The connect CLI's own VALID_ACCESS_LEVELS deliberately
// does NOT offer read-edit-own (you can't request the tier locally); that
// asymmetry is intentional and lives in packages/local/src/connect.ts.

const ALL_LEVELS = ["read-only", "read-append", "read-edit-own", "full"] as const;

const baseGraph = {
  name: "test-graph",
  type: "hosted" as const,
  token: "roam-graph-local-token-abc",
  nickname: "test",
};

describe("GraphConfigSchema — accessLevel enum", () => {
  it.each(ALL_LEVELS)("accepts %s", (level) => {
    const parsed = GraphConfigSchema.safeParse({ ...baseGraph, accessLevel: level });
    expect(parsed.success).toBe(true);
  });

  it("accepts a config with no accessLevel at all", () => {
    expect(GraphConfigSchema.safeParse(baseGraph).success).toBe(true);
  });

  it("rejects a level outside the union", () => {
    const parsed = GraphConfigSchema.safeParse({ ...baseGraph, accessLevel: "read-edit-any" });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// routeToolCall's local-sync validLevels guard
// ---------------------------------------------------------------------------
// The guard only runs on get_graph_guidelines, in local-sync mode, when the
// client implements getTokenInfo. It decides what reaches onTokenStatusUpdate.

function harness(grantedAccessLevel: string, resolved: Record<string, unknown> = {}) {
  const onTokenStatusUpdate = vi.fn().mockResolvedValue(undefined);
  const run = () =>
    routeToolCall(
      "get_graph_guidelines",
      { graph: "test" },
      {
        resolveGraph: async () => ({ ...baseGraph, ...resolved }),
        createClient: () => ({
          call: async () => ({
            success: true,
            result: { guidelines: "be kind", starredPages: [], todaysDailyNotePage: null },
          }),
          getTokenInfo: async () => ({
            status: "active" as const,
            info: { success: true, grantedAccessLevel },
          }),
        }),
        tokenInfoMode: "local-sync",
        onTokenStatusUpdate,
      },
    );
  return { run, onTokenStatusUpdate };
}

describe("routeToolCall — validLevels guard (local-sync)", () => {
  it("persists a server-granted read-edit-own level", async () => {
    // accessLevel differs from the grant, so the guard must let it through
    const { run, onTokenStatusUpdate } = harness("read-edit-own", {
      accessLevel: "read-only",
      lastKnownTokenStatus: "active",
    });

    const result = await run();

    expect(result.isError).toBeFalsy();
    expect(onTokenStatusUpdate).toHaveBeenCalledWith("test", {
      accessLevel: "read-edit-own",
      lastKnownTokenStatus: "active",
    });
    // and the enriched result surfaces the tier to the agent
    expect((result.content[0] as { text: string }).text).toContain("read-edit-own");
  });

  it.each(ALL_LEVELS)("lets a granted %s reach onTokenStatusUpdate", async (level) => {
    // no stored accessLevel, so any granted level counts as a change
    const { run, onTokenStatusUpdate } = harness(level, { lastKnownTokenStatus: "active" });

    await run();

    expect(onTokenStatusUpdate).toHaveBeenCalledWith(
      "test",
      expect.objectContaining({ accessLevel: level }),
    );
  });

  it("drops an unrecognized level instead of writing it to config", async () => {
    // lastKnownTokenStatus is unset, so the status write still fires — which is
    // exactly what makes the absence of `accessLevel` in the patch meaningful.
    const { run, onTokenStatusUpdate } = harness("superuser", { accessLevel: "read-only" });

    await run();

    expect(onTokenStatusUpdate).toHaveBeenCalledTimes(1);
    const [nickname, patch] = onTokenStatusUpdate.mock.calls[0];
    expect(nickname).toBe("test");
    expect(patch).toEqual({ lastKnownTokenStatus: "active" });
    expect(patch).not.toHaveProperty("accessLevel");
  });
});
