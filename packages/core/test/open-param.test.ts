import { describe, expect, it, vi } from "vitest";
import {
  AppendToDailyNoteSchema,
  CreateBlockSchema,
  appendToDailyNote,
  createBlock,
} from "../src/operations/blocks.js";
import type { RoamActionClient } from "../src/types.js";

function fakeClient(): RoamActionClient & { call: ReturnType<typeof vi.fn> } {
  return { call: vi.fn().mockResolvedValue({ result: { uids: [] } }) };
}

function lastArgs(client: { call: ReturnType<typeof vi.fn> }): Record<string, unknown> {
  const [action, args] = client.call.mock.lastCall as [string, Record<string, unknown>[]];
  expect(action).toBe("data.block.fromMarkdown");
  return args[0];
}

// `open` is sent only when defined, so `false` survives and omitted stays omitted
describe("open on the fromMarkdown call builders", () => {
  const cases = [
    {
      name: "create_block",
      run: (client: RoamActionClient, open?: boolean) =>
        createBlock(client, { pageTitle: "Notes", markdown: "- a\n  - b", open }),
    },
    {
      name: "append_to_daily_note",
      run: (client: RoamActionClient, open?: boolean) =>
        appendToDailyNote(client, { markdown: "- a\n  - b", date: "03-17-2026", open }),
    },
  ];

  for (const { name, run } of cases) {
    it(`${name}: open:false reaches the wire as false`, async () => {
      const client = fakeClient();
      await run(client, false);
      expect(lastArgs(client)).toMatchObject({ "markdown-string": "- a\n  - b", open: false });
    });

    it(`${name}: open:true reaches the wire as true`, async () => {
      const client = fakeClient();
      await run(client, true);
      expect(lastArgs(client).open).toBe(true);
    });

    it(`${name}: an omitted open leaves the key absent`, async () => {
      const client = fakeClient();
      await run(client, undefined);
      expect(lastArgs(client)).not.toHaveProperty("open");
    });
  }
});

describe("open schema validation", () => {
  it("accepts booleans and rejects non-booleans", () => {
    expect(CreateBlockSchema.parse({ pageTitle: "Notes", markdown: "x", open: false }).open).toBe(
      false,
    );
    expect(AppendToDailyNoteSchema.parse({ markdown: "x", open: true }).open).toBe(true);
    expect(() =>
      CreateBlockSchema.parse({ pageTitle: "Notes", markdown: "x", open: "false" }),
    ).toThrow();
    expect(() => AppendToDailyNoteSchema.parse({ markdown: "x", open: 0 })).toThrow();
  });

  it("leaves open undefined when omitted", () => {
    expect(CreateBlockSchema.parse({ pageTitle: "Notes", markdown: "x" }).open).toBeUndefined();
    expect(AppendToDailyNoteSchema.parse({ markdown: "x" }).open).toBeUndefined();
  });
});
