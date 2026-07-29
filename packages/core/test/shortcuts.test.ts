import { describe, expect, it, vi } from "vitest";
import { AddShortcutSchema, addShortcut, removeShortcut } from "../src/operations/shortcuts.js";
import type { RoamActionClient } from "../src/types.js";

function mockClient(): RoamActionClient & { call: ReturnType<typeof vi.fn> } {
  return { call: vi.fn().mockResolvedValue({}) };
}

describe("AddShortcutSchema.index", () => {
  it("accepts an omitted index", () => {
    expect(AddShortcutSchema.parse({ uid: "abc" }).index).toBeUndefined();
  });

  it("accepts and coerces a non-negative integer", () => {
    expect(AddShortcutSchema.parse({ uid: "abc", index: 3 }).index).toBe(3);
    expect(AddShortcutSchema.parse({ uid: "abc", index: "2" }).index).toBe(2); // CLI passes strings
    expect(AddShortcutSchema.parse({ uid: "abc", index: 0 }).index).toBe(0);
  });

  it("rejects fractional and negative indexes (the description promises a 0-based position)", () => {
    expect(() => AddShortcutSchema.parse({ uid: "abc", index: 1.5 })).toThrow();
    expect(() => AddShortcutSchema.parse({ uid: "abc", index: -1 })).toThrow();
  });
});

describe("shortcut operations use positional args (no { page: { uid } } wrapper)", () => {
  it("addShortcut sends [uid] when index is omitted and [uid, index] when present", async () => {
    const client = mockClient();
    await addShortcut(client, { uid: "abc" });
    expect(client.call).toHaveBeenLastCalledWith("data.page.addShortcut", ["abc"]);
    await addShortcut(client, { uid: "abc", index: 2 });
    expect(client.call).toHaveBeenLastCalledWith("data.page.addShortcut", ["abc", 2]);
  });

  it("removeShortcut sends [uid]", async () => {
    const client = mockClient();
    await removeShortcut(client, { uid: "abc" });
    expect(client.call).toHaveBeenLastCalledWith("data.page.removeShortcut", ["abc"]);
  });
});
