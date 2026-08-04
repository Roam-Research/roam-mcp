import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROAM_SYNTAX, ROAM_SYNTAX_APPEND_ONLY } from "../src/roam-syntax.js";
import { dataTools, desktopUiTools } from "../src/tools.js";

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
  {
    label: "numbered lists come from childrenViewType on the parent",
    pattern: /childrenViewType[^\n]{0,40}numbered/i,
  },
  {
    label: "{{[[TODO]]}} checkbox must lead the block",
    pattern: /\{\{\[\[TODO\]\]\}\}[\s\S]{0,60}(start|lead)/i,
  },
  {
    label: "update_block stores its string literally",
    pattern: /update_block`?\s+stores its\s+`?string`?\s+\**literal/i,
  },
  {
    // bound to childrenViewType so a stray "not create_block" elsewhere can't satisfy it
    label: "childrenViewType is NOT a create_block param",
    pattern: /childrenViewType[\s\S]{0,90}not\**[\s\S]{0,12}`?create_block/i,
  },
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
  it("ROAM_SYNTAX is under ~700 tokens (≈2800 chars)", () => {
    // 2600→2650 (07-29): truncated guard + no-duplication + precedence lines.
    // 2650→2800 (08-04): the damage-ranked restructure (worked example + end checksum)
    // and the create-tree clause (nested `- ` tree in one call — the most-used write path).
    // Don't creep further — depth belongs in the skill.
    expect(ROAM_SYNTAX.length).toBeLessThan(2800);
  });
});

describe("roam-syntax: append-only subset (encrypted graphs)", () => {
  // Split a blob into its sections keyed by the leading ALL-CAPS label.
  const sections = (blob: string): Record<string, string> =>
    Object.fromEntries(blob.split("\n\n").map((s) => [s.split(".")[0], s]));

  it("stays a true subset: the shared sections are IDENTICAL where fully shared", () => {
    // The subset composes from the same section constants as the full blob.
    // ESCAPING is fully shared → must be byte-identical. LINKS and FORMATTING
    // are parameterized (per-audience tail/parenthetical) → their shared parts
    // must be byte-identical: the LINKS prefix up to the ref clause, and the
    // FORMATTING tail after the italics parenthetical.
    const full = sections(ROAM_SYNTAX);
    const sub = sections(ROAM_SYNTAX_APPEND_ONLY);

    expect(sub.ESCAPING).toBe(full.ESCAPING);

    const linksPrefix = (s: string) => s.slice(0, s.indexOf("`((uid))`"));
    expect(linksPrefix(sub.LINKS)).not.toBe("");
    expect(linksPrefix(sub.LINKS)).toBe(linksPrefix(full.LINKS));

    const fmtTail = (s: string) => s.slice(s.indexOf(". Bold `**text**`"));
    expect(fmtTail(sub.FORMATTING).length).toBeGreaterThan(100);
    expect(fmtTail(sub.FORMATTING)).toBe(fmtTail(full.FORMATTING));

    // And the shared tree clause appears in both (full: CREATE section; subset: WRITING).
    const tree = "nested `- ` bullet tree (indentation = children)";
    expect(ROAM_SYNTAX).toContain(tree);
    expect(ROAM_SYNTAX_APPEND_ONLY).toContain(tree);
  });

  it("never mentions any tool outside its two-tool surface (derived from the registry)", () => {
    // Derived, not hand-maintained: every registered tool name except the two an
    // append-only connection actually has. Word-boundary matching so e.g. the
    // tool name "search" can't false-positive on words like "Research".
    const APPEND_ONLY_SURFACE = new Set(["get_graph_guidelines", "append_to_daily_note"]);
    const allToolNames = [...dataTools, ...desktopUiTools].map((t) => t.name);
    expect(allToolNames.length).toBeGreaterThan(20); // registry actually loaded
    for (const name of allToolNames) {
      if (APPEND_ONLY_SURFACE.has(name)) continue;
      const wordBounded = new RegExp(`(^|[^A-Za-z_])${name}($|[^A-Za-z_])`, "i");
      expect(ROAM_SYNTAX_APPEND_ONLY, name).not.toMatch(wordBounded);
    }
  });

  it("never mentions read-format constructs or state-discovery instructions it can't use", () => {
    for (const forbidden of [
      "truncated",
      "<ref>",
      "<roam",
      "WRITE-BACK",
      // no instruction may presuppose state discovery this agent can't do:
      // "reference it instead" implies finding existing blocks/uids, which a
      // read-less agent can only satisfy by INVENTING a uid.
      "reference it instead",
      "don't duplicate",
    ]) {
      // case-insensitive: a rewording like "Don't"→"don't" must not evade the guard
      expect(ROAM_SYNTAX_APPEND_ONLY.toLowerCase(), forbidden).not.toContain(
        forbidden.toLowerCase(),
      );
    }
  });

  it("tells the read-less agent to never invent uids", () => {
    expect(ROAM_SYNTAX_APPEND_ONLY).toContain("never invent a uid");
    expect(ROAM_SYNTAX_APPEND_ONLY).toContain("cannot read the graph");
  });

  it("warns the read-less agent off numbered-list markers (unfixable-damage class)", () => {
    // append_to_daily_note has no childrenViewType param and the agent can never
    // revise — `1.` markers would be permanent broken output. Instruction-only
    // phrasing on purpose: parser behavior for ordered markers DIVERGES by
    // transport (local keeps literal; hosted strips, and nested ones can even
    // convert to a numbered view — markdown_fixtures.cljc), so any behavioral
    // claim here would be false somewhere.
    expect(ROAM_SYNTAX_APPEND_ONLY).toMatch(/plain `- ` bullets, never `1\.` numbered markers/);
  });

  it("stays small (append-only agents have tiny tool surfaces)", () => {
    expect(ROAM_SYNTAX_APPEND_ONLY.length).toBeLessThan(1600);
  });
});

describe("roam-syntax: worked example stays internally consistent", () => {
  it("the example's UPDATE string is exactly the READ line minus bullet and tag", () => {
    // Pins the (b)(c) transform the example demonstrates: if either side of the
    // example is edited, the other must move with it.
    const read = '- See ((abc))<ref>Plan</ref> <roam uid="x"/>';
    const update = "See ((abc))<ref>Plan</ref>";
    expect(ROAM_SYNTAX).toContain(`READ: \`${read}\``);
    expect(ROAM_SYNTAX).toContain(`update_block string: \`${update}\``);
    expect(read.replace(/^- /, "").replace(/ <roam [^>]*\/>$/, "")).toBe(update);
  });

  it("the 1.-marker claim stays at non-portability (the only transport-safe claim)", () => {
    // Ordered-marker behavior diverges: local keeps `1.` as literal text; the
    // hosted parser strips it and a NESTED ordered list can convert the parent
    // to a numbered view (relemma markdown_fixtures.cljc, ordered-list-nested-
    // under-bullet). So neither "stays literal" nor "never produces a numbered
    // list" is true everywhere — only non-portability is. Pin that wording.
    expect(ROAM_SYNTAX).toMatch(/1\.` markers aren't portable/);
  });
});
