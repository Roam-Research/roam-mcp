/**
 * ROAM_SYNTAX — a compact, graph-agnostic guide to reading and writing Roam
 * content, returned by get_graph_guidelines (as the `roamSyntax` field) so an
 * agent sees it before its first read or write.
 *
 * This is the CANONICAL source of Roam agent-markdown GOTCHAS for this repo —
 * deliberately just the highest-damage things an LLM gets wrong (silent
 * corruption, broken content, graph pollution), ~700 tokens. It is the widest
 * server-side channel (it reaches skill-less clients), so it stays tight; the
 * fuller `roam-syntax` skill (skills/roam-syntax/) carries components, queries,
 * and depth, and a consistency test asserts the skill restates these invariants.
 * Edit the load-bearing facts HERE first.
 *
 * Structure (2026-08 revision, informed by a prompt-design review targeting
 * weaker models): DAMAGE-RANKED — the write-back procedure leads as numbered
 * steps with one worked example, and a short checksum repeats it at the end
 * (begin/end positions get the most attention). The graph's own guidelines
 * govern STYLE; the data-integrity rules here apply regardless.
 *
 * ROAM_SYNTAX_APPEND_ONLY is the subset for append-only connections (today:
 * encrypted graphs on the hosted transport, whose only tools are
 * get_graph_guidelines + append_to_daily_note). It composes from the SAME
 * section constants as the full blob — same facts, minus everything that
 * references tools an append-only agent doesn't have (reads, update_block,
 * write-back, truncated). The hosted encrypted-guidelines path (functions_ts)
 * will import it directly (integration pending its core-pin bump).
 *
 * Variant rule (decided 2026-08-04): blobs vary by TOOL SURFACE, never by
 * permission scope — "different exposed semantics justify a variant; different
 * authorization outcomes do not." (Scope metadata can be stale/advisory, and
 * under-informing a write-capable agent is the dangerous direction of error.)
 *
 * Teaches the post-#2659 wire format: heading level and child view type ride the
 * `<roam>` tag (not a `# ` prefix); block references read as `((uid))<ref>preview</ref>`.
 */

// ---- shared section constants (both blobs compose from these — edit once) ----

// The italics literal-vs-normalized note differs by audience: the full blob can
// name update_block; the append-only blob has no such tool to name.
const formattingSection = (italicsNote: string): string =>
  `FORMATTING. Italics is \`__text__\` — always write that${italicsNote}. Bold \`**text**\`, highlight \`^^text^^\`, strikethrough \`~~text~~\`. Checkbox \`{{[[TODO]]}}\` / \`{{[[DONE]]}}\` at the START of the block (not \`- [ ]\`) or it won't toggle. Headings \`#\`/\`##\`/\`###\` at block start, H1–3 only (\`####\` clamps to H3). In bullet markdown, nest by INDENTING — headings do NOT pull following blocks inside.`;

const linksSection = (refClause: string): string =>
  `LINKS. \`[[Page Name]]\` links AND creates the page if absent — create page links intentionally. \`#tag\` same; ${refClause}`;

const ESCAPING_SECTION =
  "ESCAPING. Backtick any markup you are DOCUMENTING (e.g. explaining how `[[links]]` or `{{[[TODO]]}}` work), or it renders live and creates real pages, refs, and checkboxes.";

// How the create-path tools consume markdown: a nested bullet tree in ONE call.
const TREE_CLAUSE =
  "for multi-block or hierarchical content, pass ONE nested `- ` bullet tree (indentation = children)";

// ---- the full blob (read + write transports) ----

export const ROAM_SYNTAX = [
  "Roam DATA-SAFETY & SYNTAX — apply before any write. Roam is an outliner; its markdown is NOT standard markdown. This graph's `guidelines` (above) govern style/conventions; the syntax and data-integrity facts below apply regardless. Depth: the roam-syntax skill (if installed).",
  "",
  'SAFE WRITE-BACK. Reads return rendered lines: `- <content> <roam uid="…"/>`. Before update_block: (a) if the tag has `truncated="N"` (search cut N chars), get_block the uid and edit the FULL text; (b) pass only the content — drop the leading `- `/indent and the whole `<roam …/>` tag; (c) KEEP any `((uid))<ref>preview</ref>` intact — the server reduces it to `((uid))`; writing the preview text alone replaces a live reference with static text. Example — READ: `- See ((abc))<ref>Plan</ref> <roam uid="x"/>` → update_block string: `See ((abc))<ref>Plan</ref>`.',
  "",
  'READING. The `<roam …/>` tag may also carry `heading`, `childrenViewType`, `refs`, or `hiddenChildren="N"` (N child blocks not shown — read deeper first). Strip the whole tag before showing content. A block reference reads as `((uid))<ref>preview</ref>` — when displaying, show the preview.',
  "",
  `CREATE vs UPDATE. create_page / create_block / append_to_daily_note PARSE Roam markdown — ${TREE_CLAUSE}. update_block stores its string LITERALLY — no parsing, no new children — use its \`heading\` / \`childrenViewType\` params for structure, and create_block for new nested content. A numbered list is \`childrenViewType: "numbered"\` on the parent (\`1.\` markers aren't portable); \`childrenViewType\` is a param on create_page / update_page / update_block, NOT create_block. Tables: write a normal pipe table; create ops convert it to \`{{[[table]]}}\`.`,
  "",
  formattingSection(
    " (`*text*`/`_text_` stay literal chars in update_block; create ops normalize them)",
  ),
  "",
  linksSection(
    "`((uid))` = block reference — prefer it over copying text (a reference stays live; a copy goes stale).",
  ),
  "",
  ESCAPING_SECTION,
  "",
  "WRITE-BACK CHECK before every update_block: full text fetched if truncated; `- `/indent and `<roam>` tag dropped; every `((uid))<ref>…</ref>` kept.",
].join("\n");

// ---- the append-only subset (encrypted graphs / write-only grants) ----

export const ROAM_SYNTAX_APPEND_ONLY = [
  "Roam SYNTAX for this append-only connection — each write appends new blocks to a daily-note page (today's unless a date is given); you cannot read the graph, or verify or revise what you wrote. Roam is an outliner; its markdown is NOT standard markdown. This graph's `guidelines` (above) govern style/conventions; the syntax and graph-integrity facts below apply regardless.",
  "",
  `WRITING. append_to_daily_note PARSES Roam markdown — ${TREE_CLAUSE}. Since you cannot fix structure afterward, compose the complete tree before sending. For lists use plain \`- \` bullets, never \`1.\` numbered markers.`,
  "",
  formattingSection(" (only `__text__` is reliable across write paths)"),
  "",
  linksSection(
    "`((uid))` = block reference — use one ONLY when a valid uid was given to you; never invent a uid.",
  ),
  "",
  ESCAPING_SECTION,
].join("\n");
