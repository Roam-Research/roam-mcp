import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROAM_SYNTAX } from "../src/roam-syntax.js";

// The shipped skill (repo-root skills/) must restate the blob's load-bearing invariants. Reading it
// throws (a HARD failure) if SKILL.md is missing or renamed — Part 2 (skill) and Part 3 (this test)
// land together, so a missing skill is a real failure, not a skip.
const skillPath = fileURLToPath(new URL("../../../skills/roam-syntax/SKILL.md", import.meta.url));
const SKILL = readFileSync(skillPath, "utf8");

// ROAM_SYNTAX (packages/core/src/roam-syntax.ts) is CANONICAL. These are the highest-damage gotchas
// that BOTH the blob and the skill must state; the guard pins that leaning the blob or editing the
// skill can't silently drop one. It is a coverage/drift guard, NOT proof of agreement — regex
// presence can't prove the two assign a token the same meaning. Depth the blob intentionally omits
// (components, queries, aliases) is NOT an invariant and lives only in the skill.
const INVARIANTS: { label: string; pattern: RegExp }[] = [
  // positive-association patterns (not bare token presence): the token must appear tied to its meaning,
  // so removing the rule while keeping the token elsewhere (e.g. the bold row saying "not __text__")
  // still fails.
  { label: "italics IS __text__", pattern: /italics? is\s+`?__text__/i },
  {
    label: "((uid))<ref> is a block reference",
    pattern: /block reference[\s\S]{0,20}\(\(uid\)\)<ref>/i,
  },
  { label: "childrenViewType (view type / numbered lists)", pattern: /childrenViewType/ },
  {
    label: "{{[[TODO]]}} checkbox must lead the block",
    pattern: /\{\{\[\[TODO\]\]\}\}[\s\S]{0,60}(start|lead)/i,
  },
  {
    label: "update_block stores its string literally",
    pattern: /update_block`?\s+stores its\s+`?string`?\s+\**literal/i,
  },
  { label: "childrenViewType is NOT a create_block param", pattern: /not\**\s+`?create_block/i },
  {
    label: "headings nest by indenting (flat in bullet markdown)",
    pattern: /nest by\s+`?\**indent/i,
  },
  // the highest-damage invariant: write-back preserves the live ref. (Not /document/i — that
  // false-matched "document editor" / the document view type rather than the escape rule.)
  {
    label: "write-back keeps ((uid))<ref>…</ref> intact",
    pattern: /keep[\s\S]{0,25}\(\(uid\)\)<ref>[\s\S]{0,25}intact/i,
  },
  { label: "escape rule: live markup creates real pages", pattern: /creates?\s+real pages/i },
  {
    // partial-overwrite guard: editing a capped search result without a get_block reread
    // would overwrite the block with just its visible prefix.
    label: "truncated=N search results need a get_block before editing",
    pattern: /truncated=[\s\S]{0,140}get_block/i,
  },
];

describe("roam-syntax: blob ↔ skill invariant coverage", () => {
  for (const { label, pattern } of INVARIANTS) {
    it(`ROAM_SYNTAX states: ${label}`, () => {
      expect(ROAM_SYNTAX, label).toMatch(pattern);
    });
    it(`SKILL.md states: ${label}`, () => {
      expect(SKILL, label).toMatch(pattern);
    });
  }
});

// A few regressions that must appear in NEITHER (conservative — only shapes a correct doc never uses).
const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  {
    label: "must not claim create_page cannot populate a body (disproven by measurement)",
    pattern:
      /create_page[\s\S]{0,60}(does not|doesn'?t|cannot|can'?t|won'?t)[\s\S]{0,25}(populate|empty)/i,
  },
  {
    // guards against the old unsafe write-back advice (the P1 trap) creeping back in.
    label: "must not say copying a read line verbatim/whole is safe for write-back",
    pattern:
      /(copy|copying)[\s\S]{0,40}(verbatim|straight back|the (whole|entire|exact) line)[\s\S]{0,30}(safe|fine)/i,
  },
  {
    // reversed-italics regression: neither doc may claim *text* is italics.
    label: "must not claim *text* is italics (it's __text__)",
    pattern: /italics? is\s+`?\*text\*/i,
  },
];

describe("roam-syntax: forbidden regressions absent from blob + skill", () => {
  for (const { label, pattern } of FORBIDDEN) {
    it(label, () => {
      expect(ROAM_SYNTAX, `ROAM_SYNTAX: ${label}`).not.toMatch(pattern);
      expect(SKILL, `SKILL.md: ${label}`).not.toMatch(pattern);
    });
  }
});

describe("roam-syntax: blob stays lean", () => {
  it("ROAM_SYNTAX is under ~660 tokens (≈2650 chars)", () => {
    // Raised 2600→2650 (2026-07-29) for the truncated="N" partial-overwrite guard and the
    // no-duplication / guidelines-precedence lines from Josh's review. Don't creep further —
    // depth belongs in the skill.
    expect(ROAM_SYNTAX.length).toBeLessThan(2650);
  });
});
