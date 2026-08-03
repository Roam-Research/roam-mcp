import { describe, expect, it, vi } from "vitest";
import { SuggestLinksSchema, suggestLinks } from "../src/operations/links.js";
import type { RoamActionClient } from "../src/types.js";

describe("SuggestLinksSchema.maxResults", () => {
  it("accepts an omitted maxResults", () => {
    expect(SuggestLinksSchema.parse({ text: "hello" }).maxResults).toBeUndefined();
  });

  it("accepts and coerces positive integers", () => {
    expect(SuggestLinksSchema.parse({ text: "hello", maxResults: 5 }).maxResults).toBe(5);
    expect(SuggestLinksSchema.parse({ text: "hello", maxResults: "10" }).maxResults).toBe(10); // CLI passes strings
  });

  it("rejects zero, negative, and fractional values (the description promises a count)", () => {
    expect(() => SuggestLinksSchema.parse({ text: "hello", maxResults: 0 })).toThrow();
    expect(() => SuggestLinksSchema.parse({ text: "hello", maxResults: -3 })).toThrow();
    expect(() => SuggestLinksSchema.parse({ text: "hello", maxResults: 2.5 })).toThrow();
  });
});

describe("suggestLinks operation", () => {
  it("omits maxResults from the wire call when unset (handler applies its default)", async () => {
    const client: RoamActionClient & { call: ReturnType<typeof vi.fn> } = {
      call: vi.fn().mockResolvedValue({ result: { suggestions: [] } }),
    };
    await suggestLinks(client, { text: "hello" });
    expect(client.call).toHaveBeenLastCalledWith("data.ai.suggestLinks", [{ text: "hello" }]);
    await suggestLinks(client, { text: "hello", maxResults: 3 });
    expect(client.call).toHaveBeenLastCalledWith("data.ai.suggestLinks", [
      { text: "hello", maxResults: 3 },
    ]);
  });
});
