import { describe, expect, it } from "vitest";
import { RoamError } from "../src/types.js";
import {
  isRelativeDateWord,
  localTodayString,
  resolveDailyNotePage,
} from "../src/relative-date.js";

describe("resolveDailyNotePage", () => {
  it("resolves 'today' against the base date", () => {
    expect(resolveDailyNotePage("today", "2026-03-17")).toBe("03-17-2026");
  });

  it("resolves 'yesterday' across a year boundary", () => {
    expect(resolveDailyNotePage("yesterday", "2026-01-01")).toBe("12-31-2025");
  });

  it("resolves 'tomorrow' across a year boundary", () => {
    expect(resolveDailyNotePage("tomorrow", "2026-12-31")).toBe("01-01-2027");
  });

  it("resolves a leap day correctly", () => {
    expect(resolveDailyNotePage("yesterday", "2024-03-01")).toBe("02-29-2024");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveDailyNotePage("  Today ", "2026-03-17")).toBe("03-17-2026");
    expect(resolveDailyNotePage("TOMORROW", "2026-03-17")).toBe("03-18-2026");
  });

  it("passes a literal MM-DD-YYYY through unchanged (base ignored)", () => {
    expect(resolveDailyNotePage("03-17-2026", "2026-01-01")).toBe("03-17-2026");
  });

  it("does not treat Object.prototype keys as relative words (no NaN date)", () => {
    // "constructor"/"__proto__" are already-lowercase prototype members — a
    // plain-object lookup would index a function and produce "NaN-NaN-NaN".
    expect(resolveDailyNotePage("constructor", "2026-01-01")).toBe("constructor");
    expect(resolveDailyNotePage("__proto__", "2026-01-01")).toBe("__proto__");
  });

  it("throws when a relative word has no base date (no silent server clock)", () => {
    expect(() => resolveDailyNotePage("today", undefined)).toThrow(RoamError);
  });

  it("throws when the base date is malformed", () => {
    expect(() => resolveDailyNotePage("today", "not-a-date")).toThrow(RoamError);
  });

  it("throws on a shape-valid but out-of-range base (no silent rollover)", () => {
    expect(() => resolveDailyNotePage("today", "2026-13-40")).toThrow(RoamError);
    expect(() => resolveDailyNotePage("today", "2026-02-30")).toThrow(RoamError);
  });
});

describe("isRelativeDateWord", () => {
  it("recognizes the relative words (case-insensitive, trimmed)", () => {
    expect(isRelativeDateWord("today")).toBe(true);
    expect(isRelativeDateWord(" Yesterday ")).toBe(true);
    expect(isRelativeDateWord("TOMORROW")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isRelativeDateWord("03-17-2026")).toBe(false);
    expect(isRelativeDateWord("next week")).toBe(false);
    expect(isRelativeDateWord("tonight")).toBe(false);
  });

  it("rejects Object.prototype keys (prototype-chain guard)", () => {
    expect(isRelativeDateWord("constructor")).toBe(false);
    expect(isRelativeDateWord("__proto__")).toBe(false);
    expect(isRelativeDateWord("CONSTRUCTOR")).toBe(false);
  });
});

describe("localTodayString", () => {
  it("returns a yyyy-MM-dd string", () => {
    expect(localTodayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats an injected date with zero-padded month/day (catches a month/day swap)", () => {
    // Local-field constructor: month is 0-indexed, so this is March 7, 2026.
    expect(localTodayString(new Date(2026, 2, 7))).toBe("2026-03-07");
  });
});
