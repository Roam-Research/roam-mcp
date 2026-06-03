// Relative daily-note date resolution for the create_block dailyNotePage param.
//
// Resolves the words "today" / "yesterday" / "tomorrow" to the MM-DD-YYYY
// string Roam uses for daily-note pages, BEFORE the value crosses the wire — so
// the backend and renderer only ever receive a concrete MM-DD-YYYY (no new
// vocabulary, no version coupling).
//
// All arithmetic is done in UTC (Date.UTC / setUTCDate): every UTC day is
// exactly 86_400_000 ms, so the ±1-day math has no DST edge cases and the host
// machine's timezone can never perturb the result. Core has no date library;
// this is intentionally tiny.

import { RoamError, ErrorCodes } from "./types.js";

// Null-prototype so `in` / bracket-access only see our own keys — a plain
// object would let already-lowercase Object.prototype members ("constructor",
// "__proto__") slip through `isRelativeDateWord` and index a function as the
// offset, producing a "NaN-NaN-NaN" date.
const RELATIVE_OFFSETS: Record<string, number> = Object.assign(Object.create(null), {
  today: 0,
  yesterday: -1,
  tomorrow: 1,
});

/** The MM-DD-YYYY daily-note-page wire format. */
export const MM_DD_YYYY = /^\d{2}-\d{2}-\d{4}$/;

/** Is `value` (trimmed, case-insensitive) one of today/yesterday/tomorrow? */
export function isRelativeDateWord(value: string): boolean {
  return value.trim().toLowerCase() in RELATIVE_OFFSETS;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a UTC-anchored Date as MM-DD-YYYY. */
function toMmDdYyyy(d: Date): string {
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}-${d.getUTCFullYear()}`;
}

/**
 * The host machine's local calendar date as yyyy-MM-dd. This is the one place
 * that reads the host clock: the local transport calls it for its
 * getCurrentDate(), so "use machine-local time" is an explicit transport
 * decision, never something core guesses on its own. `now` is injectable for
 * deterministic tests.
 */
export function localTodayString(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Resolve a dailyNotePage value to a concrete MM-DD-YYYY string.
 *  - A literal MM-DD-YYYY is returned unchanged (the base date is ignored).
 *  - A relative word (today/yesterday/tomorrow, case-insensitive) is resolved
 *    against `baseDateStr` — a yyyy-MM-dd calendar date parsed by digits into a
 *    UTC anchor, then offset by ±1 day.
 *
 * If a relative word is given but `baseDateStr` is absent (or malformed), THROW.
 * Core must never silently fall back to its own clock, because it also runs on
 * the hosted transport (Cloud Run, UTC). Both first-party transports supply
 * getCurrentDate(), so a missing base means a misbehaving/third-party client —
 * a loud error beats a silently-wrong date.
 */
export function resolveDailyNotePage(value: string, baseDateStr: string | undefined): string {
  const offset = RELATIVE_OFFSETS[value.trim().toLowerCase()];
  if (offset === undefined) {
    return value; // literal MM-DD-YYYY passthrough — never alter it
  }
  if (baseDateStr === undefined) {
    throw new RoamError(
      `Could not resolve relative date "${value}": this transport provides no current date.`,
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseDateStr.trim());
  if (!m) {
    throw new RoamError(
      `Could not resolve relative date "${value}": invalid current date "${baseDateStr}".`,
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  // The regex is shape-only — reject an out-of-range base (e.g. "2026-13-40")
  // rather than letting Date.UTC roll it over into a silently-wrong date.
  if (
    anchor.getUTCFullYear() !== year ||
    anchor.getUTCMonth() !== month - 1 ||
    anchor.getUTCDate() !== day
  ) {
    throw new RoamError(
      `Could not resolve relative date "${value}": invalid current date "${baseDateStr}".`,
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  anchor.setUTCDate(anchor.getUTCDate() + offset);
  return toMmDdYyyy(anchor);
}
