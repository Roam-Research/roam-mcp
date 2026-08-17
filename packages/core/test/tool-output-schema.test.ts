import { describe, expect, it } from "vitest";
import { dataTools, findTool, stripUndeclaredStructuredContent } from "../src/tools.js";
import { textResult } from "../src/types.js";

// Output schemas are WRITE-ONLY: the 9 write tools declare a schema (the SDK
// validates structuredContent against it on success); the 9 read tools are
// content-only. These tests pin that split, the additive textResult
// structuredContent path, and representative write payloads. (Why write-only +
// the ChatGPT stale-cache hazard: see the presets comment block in src/tools.ts.)

const WRITE_TOOLS = [
  "create_page",
  "create_block",
  "append_to_daily_note",
  "update_block",
  "delete_block",
  "move_block",
  "add_comment",
  "delete_page",
  "update_page",
];

describe("output schemas are declared on write tools only", () => {
  it("the 9 write tools declare an outputSchema, the 9 reads do not", () => {
    expect(dataTools.length).toBe(18);
    const withSchema = dataTools
      .filter((t) => t.outputSchema)
      .map((t) => t.name)
      .sort();
    expect(withSchema).toEqual([...WRITE_TOOLS].sort());
    for (const tool of dataTools) {
      expect(Boolean(tool.outputSchema), `${tool.name} outputSchema`).toBe(
        WRITE_TOOLS.includes(tool.name),
      );
    }
  });
});

describe("textResult attaches structuredContent for plain objects only", () => {
  it("plain object → structuredContent mirrors value (text unchanged)", () => {
    const r = textResult({ uids: ["a"] });
    expect(r.structuredContent).toEqual({ uids: ["a"] });
    expect(r.content[0]).toMatchObject({ type: "text" });
  });
  it("array / string / null → no structuredContent", () => {
    expect(textResult([1, 2]).structuredContent).toBeUndefined();
    expect(textResult("hi").structuredContent).toBeUndefined();
    expect(textResult(null).structuredContent).toBeUndefined();
  });
});

describe("representative write structuredContent validates against each schema", () => {
  const cases: Array<[string, unknown]> = [
    ["create_block", { uids: ["x"] }],
    ["create_page", { uid: "x" }],
    ["add_comment", { uids: ["x"], parentUid: "p" }],
    ["update_block", { success: true }],
    ["delete_block", { success: true }],
    ["move_block", { success: true }],
    ["update_page", { success: true }],
    ["delete_page", { success: true }],
    // 0.11 delete report passthrough — DeleteOutput declares `deleted` UNTYPED
    // (z.unknown()): the field is server-owned, so no server value may fail transport
    // validation after a committed delete (core's own check is a strict === false)
    ["delete_block", { success: true, deleted: true }],
    ["delete_page", { success: true, deleted: true }],
    ["delete_block", { success: true, deleted: null }],
    ["delete_page", { success: true, deleted: "tolerated-by-design" }],
    // graph field injected by withGraphField is declared + accepted
    ["create_block", { uids: ["x"], graph: "my-graph" }],
  ];
  for (const [name, payload] of cases) {
    it(`${name} accepts ${JSON.stringify(payload).slice(0, 44)}`, () => {
      const schema = findTool(name)?.outputSchema;
      expect(schema, `${name} schema`).toBeDefined();
      expect(schema!.safeParse(payload).success, name).toBe(true);
    });
  }
});

describe("schemas are open (passthrough keeps + advertises extra keys)", () => {
  it("create_block retains unexpected extra keys (passthrough, not strip)", () => {
    const parsed = findTool("create_block")!.outputSchema!.safeParse({ uids: ["a"], extra: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ uids: ["a"], extra: 1 });
  });

  it("the deletes DECLARE `deleted` (advertised in tools/list), other writes don't", () => {
    // the only thing DeleteOutput adds over the passthrough-open SuccessOutput is that
    // `deleted` appears in the emitted JSON Schema — passthrough means every payload
    // validates either way, so without this the schema swap would be invisible
    for (const name of ["delete_block", "delete_page"]) {
      expect(Object.keys(findTool(name)!.outputSchema!.shape), name).toContain("deleted");
    }
    expect(Object.keys(findTool("update_block")!.outputSchema!.shape)).not.toContain("deleted");
  });

  it("delete_block (SuccessOutput.extend) keeps passthrough", () => {
    // a zod bump changing .extend() semantics would silently STRIP unknown keys from
    // structuredContent while the text channel kept them — this pins the claim
    const parsed = findTool("delete_block")!.outputSchema!.safeParse({ deleted: true, extra: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ deleted: true, extra: 1 });
  });
});

describe("stripUndeclaredStructuredContent — schema-less tools are content-only", () => {
  const base = {
    content: [{ type: "text" as const, text: "x" }],
    structuredContent: { a: 1 },
  };
  it("strips structuredContent when the tool declares no outputSchema", () => {
    const r = stripUndeclaredStructuredContent(base, {});
    expect(r.structuredContent).toBeUndefined();
    expect(r.content).toEqual(base.content);
  });
  it("keeps structuredContent when the tool declares an outputSchema", () => {
    const r = stripUndeclaredStructuredContent(base, { outputSchema: {} });
    expect(r.structuredContent).toEqual({ a: 1 });
  });
  it("is a no-op when there is no structuredContent", () => {
    const textOnly = { content: [{ type: "text" as const, text: "x" }] };
    expect(stripUndeclaredStructuredContent(textOnly, {})).toBe(textOnly);
  });
});
