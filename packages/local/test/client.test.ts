import { describe, expect, it } from "vitest";
import { RoamClient } from "../src/client.js";

// The local transport's getCurrentDate() feeds core's relative dailyNotePage
// resolution. The npx process shares the user's machine clock, so it returns
// the machine-local calendar date.
describe("RoamClient.getCurrentDate", () => {
  it("returns the machine-local date as yyyy-MM-dd", () => {
    const client = new RoamClient({
      graphName: "test-graph",
      graphType: "hosted",
      token: "roam-graph-local-token-test",
    });
    expect(client.getCurrentDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
