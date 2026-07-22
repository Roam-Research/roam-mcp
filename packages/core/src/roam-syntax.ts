/**
 * ROAM_SYNTAX — a compact, graph-agnostic guide to reading and writing Roam
 * content, returned by get_graph_guidelines (as the `roamSyntax` field) so an
 * agent sees it before its first read or write.
 *
 * This is the CANONICAL source of Roam agent-markdown GOTCHAS for this repo —
 * deliberately just the highest-damage things an LLM gets wrong (silent
 * corruption, broken content, graph pollution), ~600 tokens. It is the widest
 * server-side channel (it reaches skill-less clients), so it stays tight; the
 * fuller `roam-syntax` skill (skills/roam-syntax/) carries components, queries,
 * and depth, and a consistency test asserts the skill restates these invariants.
 * Edit the load-bearing facts HERE first.
 *
 * Teaches the post-#2659 wire format: heading level and child view type ride the
 * `<roam>` tag (not a `# ` prefix); block references read as `((uid))<ref>preview</ref>`.
 * Universal Roam knowledge — distinct from the user's own `[[roam/agent guidelines]]`
 * page (surfaced separately as the `guidelines` field).
 */
export const ROAM_SYNTAX = [
  "Reading & writing a Roam graph — the gotchas that matter (Roam is an outliner; its markdown is NOT standard markdown). Full syntax, components, and queries live in the roam-syntax skill and Roam's help; this graph's own conventions are in the `guidelines` above.",
  "",
  "FORMATTING. Italics is `__text__` (double underscore) — always write that. `update_block` stores `*text*` / `_text_` as literal characters (not italics); create_page/create_block normalize them to `__text__`, but only `__text__` round-trips read↔write. Bold `**text**`, highlight `^^text^^`, strikethrough `~~text~~`.",
  "",
  "TASKS & HEADINGS. Checkbox `{{[[TODO]]}}` / `{{[[DONE]]}}` (not `- [ ]`) — must be at the START of the block or it won't toggle. Headings `#`/`##`/`###` at the start of a block, H1–3 only (`####` clamps to H3). In bullet-list markdown, nest by INDENTING — a heading does NOT slurp the blocks after it into itself.",
  "",
  'CREATE vs UPDATE. create_page / create_block PARSE markdown (everything here). update_block stores its string LITERALLY — no parsing, no new children — so use its `heading` / `childrenViewType` params for structure, and create_block for new nested content. A numbered list is `childrenViewType: "numbered"` on the parent (NOT `1.` markers); `childrenViewType` is a param on create_page / update_page / update_block, NOT create_block. Tables: write a normal pipe table (create ops convert it to a `{{[[table]]}}` block) — don\'t hand-build one.',
  "",
  "LINKS. `[[Page Name]]` (creates the page + a backlink), `#tag`, `((uid))` (block reference). Link liberally — that's the point of Roam.",
  "",
  'READING. Each block is `- <text> <roam uid="…"/>`; the tag may also carry `heading`, `childrenViewType`, `refs`, or `hiddenChildren="N"` (its subtree was truncated — read deeper). Strip the whole `<roam …/>` tag before showing content to the user. A block reference reads as `((uid))<ref>preview</ref>` — show the preview text when displaying.',
  "",
  "WRITING BACK a block you read. Pass only the block content to update_block — drop the leading `- ` / indentation and the trailing `<roam …/>` tag — but KEEP any `((uid))<ref>…</ref>` intact; the server reduces it to `((uid))`. Do NOT write the display-cleaned preview alone, which replaces the live reference with static text.",
  "",
  "ESCAPING. Backtick any markup you are DOCUMENTING (e.g. explaining how `[[links]]` or `{{[[TODO]]}}` work), or it renders live and creates real pages, refs, and checkboxes.",
].join("\n");
