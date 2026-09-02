import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes, RoamError } from "@roam-research/roam-tools-core";
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

// Roam stamps apiVersion on every response, error bodies included, so a 404
// UNKNOWN_ACTION names the build the user is running. handleApiError forwards it as
// RoamError context; core's batch tools read it when a missing action is feature-detected.
describe("RoamClient 404 UNKNOWN_ACTION", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(body: Record<string, unknown>): void {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, json: () => body }));
  }

  function unknownAction(): Promise<unknown> {
    const client = new RoamClient({
      graphName: "test-graph",
      graphType: "hosted",
      token: "roam-graph-local-token-test",
      port: 3333,
    });
    return client.call("data.block.deleteMany").then(
      () => undefined,
      (e: unknown) => e,
    );
  }

  it("carries the server's apiVersion as error context", async () => {
    stubFetch({
      success: false,
      error: { code: "UNKNOWN_ACTION", message: "data.block.deleteMany" },
      apiVersion: "1.1.5",
    });
    const error = await unknownAction();
    expect(error).toBeInstanceOf(RoamError);
    expect((error as RoamError).code).toBe(ErrorCodes.UNKNOWN_ACTION);
    expect((error as RoamError).message).toBe("Unknown API action: data.block.deleteMany");
    expect((error as RoamError).context).toEqual({ apiVersion: "1.1.5" });
  });

  it("has no apiVersion key when the body reports none", async () => {
    stubFetch({ success: false, error: { code: "UNKNOWN_ACTION", message: "nope" } });
    const error = await unknownAction();
    expect((error as RoamError).code).toBe(ErrorCodes.UNKNOWN_ACTION);
    expect((error as RoamError).context).toBeUndefined();
  });
});
