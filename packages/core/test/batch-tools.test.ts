import { describe, expect, it, vi } from "vitest";
import {
  DeleteBlocksSchema,
  UpdateBlocksSchema,
  deleteBlocks,
  updateBlocks,
} from "../src/operations/blocks.js";
import { findTool } from "../src/tools.js";
import { RoamError, type RoamActionClient } from "../src/types.js";

// core's half of the batch contract: wire mapping, fail-closed report validation, derived
// aggregates (never the server's), and the 0-success code rule

function clientReturning(result: unknown): RoamActionClient & { call: ReturnType<typeof vi.fn> } {
  return { call: vi.fn().mockResolvedValue({ success: true, result }) };
}

function clientThrowing(error: unknown): RoamActionClient & { call: ReturnType<typeof vi.fn> } {
  return { call: vi.fn().mockRejectedValue(error) };
}

function wireArgs(client: { call: ReturnType<typeof vi.fn> }): [string, Record<string, unknown>] {
  const [action, args] = client.call.mock.lastCall as [string, Record<string, unknown>[]];
  return [action, args[0]];
}

function structured(result: { structuredContent?: unknown }): Record<string, unknown> {
  return result.structuredContent as Record<string, unknown>;
}

const ok = (uid: string) => ({ uid, ok: true });

describe("wire args", () => {
  it("update_blocks maps camelCase to kebab keys, one item per input", async () => {
    const client = clientReturning({ results: [ok("a"), ok("b")] });
    await updateBlocks(client, {
      updates: [
        {
          uid: "a",
          string: "hi",
          open: false,
          heading: 2,
          childrenViewType: "numbered",
          textAlign: "center",
        },
        { uid: "b", string: "there" },
      ],
    });
    expect(wireArgs(client)).toEqual([
      "data.block.updateBlocks",
      {
        updates: [
          {
            uid: "a",
            string: "hi",
            open: false,
            heading: 2,
            "children-view-type": "numbered",
            "text-align": "center",
          },
          { uid: "b", string: "there" },
        ],
      },
    ]);
  });

  it("update_blocks omits undefined keys rather than clearing them", async () => {
    const client = clientReturning({ results: [ok("a")] });
    await updateBlocks(client, { updates: [{ uid: "a", open: true }] });
    const item = (wireArgs(client)[1].updates as Record<string, unknown>[])[0];
    expect(Object.keys(item).sort()).toEqual(["open", "uid"]);
  });

  it("delete_blocks sends the uids verbatim", async () => {
    const client = clientReturning({ results: [ok("a"), ok("b")] });
    await deleteBlocks(client, { uids: ["a", "b"] });
    expect(wireArgs(client)).toEqual(["data.block.deleteBlocks", { uids: ["a", "b"] }]);
  });
});

describe("Zod enforces the 1-25 cap", () => {
  const capUids = Array.from({ length: 25 }, (_, i) => `u${i}`);
  it("update_blocks: rejects 0 and 26, accepts 1 and 25", () => {
    expect(UpdateBlocksSchema.safeParse({ updates: [] }).success).toBe(false);
    expect(
      UpdateBlocksSchema.safeParse({ updates: [...capUids, "u25"].map((uid) => ({ uid })) })
        .success,
    ).toBe(false);
    expect(UpdateBlocksSchema.safeParse({ updates: [{ uid: "a" }] }).success).toBe(true);
    expect(UpdateBlocksSchema.safeParse({ updates: capUids.map((uid) => ({ uid })) }).success).toBe(
      true,
    );
  });

  it("delete_blocks: rejects 0 and 26, accepts 1 and 25", () => {
    expect(DeleteBlocksSchema.safeParse({ uids: [] }).success).toBe(false);
    expect(DeleteBlocksSchema.safeParse({ uids: [...capUids, "u25"] }).success).toBe(false);
    expect(DeleteBlocksSchema.safeParse({ uids: ["a"] }).success).toBe(true);
    expect(DeleteBlocksSchema.safeParse({ uids: capUids }).success).toBe(true);
  });
});

describe("partial success: >=1 success is NOT an error", () => {
  const mixed = {
    // the server's own `success: true` is deliberately wrong here — core must ignore it
    success: true,
    succeeded: 99,
    failed: 0,
    results: [
      { uid: "a", ok: true, deleted: true },
      { uid: "b", ok: true, deleted: true, note: "deleted with its ancestor 'a'" },
      { uid: "c", ok: false, deleted: false, reason: "not-found" },
      { uid: "d", ok: false, code: "INSUFFICIENT_SCOPE", message: "not created by you" },
    ],
  };
  const uids = ["a", "b", "c", "d"];

  it("returns a non-error result with derived aggregates and the items passed through", async () => {
    const result = await deleteBlocks(clientReturning(mixed), { uids });
    expect(result.isError).toBeFalsy();
    expect(structured(result)).toEqual({
      success: false,
      succeeded: 2,
      failed: 2,
      results: mixed.results,
    });
  });

  it("structuredContent validates against the declared BatchOutput", async () => {
    const result = await deleteBlocks(clientReturning(mixed), { uids });
    const schema = findTool("delete_blocks")!.outputSchema!;
    expect(schema.safeParse(structured(result)).success).toBe(true);
  });

  it("an all-success batch derives success: true", async () => {
    const result = await updateBlocks(clientReturning({ results: [ok("a"), ok("b")] }), {
      updates: [{ uid: "a" }, { uid: "b" }],
    });
    expect(structured(result)).toMatchObject({ success: true, succeeded: 2, failed: 0 });
  });
});

describe("0 successes: the code rule", () => {
  async function failure(run: () => Promise<unknown>): Promise<RoamError> {
    const error = await run().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RoamError);
    return error as RoamError;
  }

  it("homogeneous per-item code is reused, with the shared item message", async () => {
    const results = [
      { uid: "a", ok: false, code: "VALIDATION_ERROR", message: "is a page, not a block" },
      { uid: "b", ok: false, code: "VALIDATION_ERROR", message: "is a page, not a block" },
    ];
    const error = await failure(() =>
      updateBlocks(clientReturning({ results }), { updates: [{ uid: "a" }, { uid: "b" }] }),
    );
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("is a page, not a block");
    expect(error.context).toEqual({ results, succeeded: 0, failed: 2 });
  });

  it("all-missing deletes map to the core-synthesized NOT_FOUND", async () => {
    const results = [
      { uid: "a", ok: false, deleted: false, reason: "not-found" },
      { uid: "b", ok: false, deleted: false, reason: "not-found" },
    ];
    const error = await failure(() =>
      deleteBlocks(clientReturning({ results }), { uids: ["a", "b"] }),
    );
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toContain("do not retry");
  });

  it("a 1-item missing delete reuses the single-tool copy verbatim", async () => {
    const error = await failure(() =>
      deleteBlocks(clientReturning({ results: [{ uid: "a", ok: false, deleted: false }] }), {
        uids: ["a"],
      }),
    );
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toContain("no block with uid");
    expect(error.message).toContain("do not retry");
  });

  it("an unrecognized delete reason drops the already-gone claim", async () => {
    const results = [
      { uid: "a", ok: false, deleted: false, reason: "not-found" },
      { uid: "b", ok: false, deleted: false, reason: "locked-by-another-user" },
    ];
    const error = await failure(() =>
      deleteBlocks(clientReturning({ results }), { uids: ["a", "b"] }),
    );
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).not.toContain("do not retry");
    expect(error.message).toContain("Do NOT assume they are gone");
  });

  it("mixed failure codes fall back to BATCH_FAILED with the generic message", async () => {
    const results = [
      { uid: "a", ok: false, code: "VALIDATION_ERROR", message: "malformed uid" },
      { uid: "b", ok: false, code: "INSUFFICIENT_SCOPE", message: "not created by you" },
    ];
    const error = await failure(() =>
      updateBlocks(clientReturning({ results }), { updates: [{ uid: "a" }, { uid: "b" }] }),
    );
    expect(error.code).toBe("BATCH_FAILED");
    expect(error.message).toBe(
      "All 2 items failed — see the error context for the per-item report",
    );
    expect(error.context).toEqual({ results, succeeded: 0, failed: 2 });
  });

  it("one code but differing messages keeps the code and uses the generic message", async () => {
    const results = [
      { uid: "a", ok: false, code: "VALIDATION_ERROR", message: "is a page, not a block" },
      { uid: "b", ok: false, code: "VALIDATION_ERROR", message: "combine changes into one item" },
    ];
    const error = await failure(() =>
      updateBlocks(clientReturning({ results }), { updates: [{ uid: "a" }, { uid: "b" }] }),
    );
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("All 2 items failed");
  });
});

describe("malformed reports fail closed", () => {
  const cases: Array<[string, unknown]> = [
    ["results is not an array", { results: { a: true } }],
    ["no results key at all", { succeeded: 2, failed: 0 }],
    ["null payload", null],
    ["length mismatch", { results: [ok("a")] }],
    ["uid mismatch", { results: [ok("a"), ok("zzz")] }],
    ["non-boolean ok", { results: [ok("a"), { uid: "b", ok: null }] }],
    ["item is not an object", { results: [ok("a"), "b"] }],
  ];

  for (const [name, payload] of cases) {
    it(`${name}: throws INTERNAL_ERROR carrying the raw payload`, async () => {
      const error = await deleteBlocks(clientReturning(payload), { uids: ["a", "b"] }).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(RoamError);
      const roamError = error as RoamError;
      expect(roamError.code).toBe("INTERNAL_ERROR");
      expect(roamError.message).toContain("malformed batch report");
      expect(roamError.context).toEqual({ action: "data.block.deleteBlocks", payload });
    });
  }
});

describe("degradation on a Roam build without the batch actions", () => {
  const message =
    "This Roam build doesn't support batch block updates yet — use update_block / delete_block one at a time, or update Roam.";

  for (const code of ["UNKNOWN_ACTION", "ACTION_NOT_AVAILABLE"]) {
    it(`${code} is rewritten to actionable copy, keeping the code`, async () => {
      const client = clientThrowing(new RoamError("Unknown API action", code));
      const error = await deleteBlocks(client, { uids: ["a"] }).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect((error as RoamError).code).toBe(code);
      expect((error as RoamError).message).toBe(message);
      expect((error as RoamError).context).toBeUndefined();
    });
  }

  it("names the build when the transport reported an apiVersion, and keeps the context", async () => {
    const client = clientThrowing(
      new RoamError("Unknown API action", "UNKNOWN_ACTION", { apiVersion: "1.1.5" }),
    );
    const error = await deleteBlocks(client, { uids: ["a"] }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect((error as RoamError).message).toBe(
      `${message} This Roam build reports API version 1.1.5.`,
    );
    expect((error as RoamError).context).toEqual({ apiVersion: "1.1.5" });
  });

  it("other errors pass through untouched", async () => {
    const thrown = new RoamError("Server error: boom", "INTERNAL_ERROR");
    const client = clientThrowing(thrown);
    await expect(updateBlocks(client, { updates: [{ uid: "a" }] })).rejects.toBe(thrown);
  });
});
