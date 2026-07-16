/**
 * ROAM_SYNTAX — a compact, graph-agnostic guide to reading and writing Roam
 * content, returned by get_graph_guidelines (as the `roamSyntax` field) so an
 * agent sees it before its first read or write.
 *
 * This is the CANONICAL source of Roam agent-markdown gotchas for this repo. A
 * planned `roam-syntax` skill (skills/roam-syntax/) will restate the same
 * invariants in longer form, with a consistency test asserting they agree — so
 * edit the load-bearing facts here first.
 *
 * It teaches the post-#2659 wire format: a block's heading level and child view
 * type ride the `<roam>` tag (not a `# ` prefix), and block references render as
 * `((uid))<ref>preview</ref>`. This is universal Roam knowledge — distinct from
 * the user's own `[[roam/agent guidelines]]` page (surfaced separately as the
 * `guidelines` field). Keep it tight; deep per-feature detail belongs in the
 * skill's references/ or Roam's hosted help, not here.
 */
export const ROAM_SYNTAX = [
  "Roam agent markdown — how to read and write this graph (applies to every Roam graph). Roam is an outliner: a page is a tree of blocks (one bullet = one block); nest with indentation, and link liberally — the structure and links are the point, not flat prose.",
  "",
  'READING. Each block is `- <text> <roam uid="…"/>`. The tag may also carry `heading="N"` (heading level 1–3), `childrenViewType` (how its children display), `refs="N"` (how many blocks reference this one — high means edit with care), and `hiddenChildren="N"` (children were truncated by maxDepth — read deeper to see them). Honor heading/childrenViewType when reconstructing structure, use `uid` for follow-up tool calls, and STRIP the whole `<roam …/>` tag before showing content to the user. A block reference is `((uid))<ref>preview</ref>`, where the `<ref>` holds the referenced block\'s text; when displaying, show the preview and drop the `((uid))` + tag.',
  "",
  "FORMATTING (Roam is NOT standard markdown). Italics is `__text__` (double underscore) — `*text*` and `_text_` are literal characters, NOT italics. Bold is `**text**`. Highlight `^^text^^`. Strikethrough `~~text~~`. `inline code` and fenced code blocks as usual.",
  "",
  "STRUCTURE. Task/checkbox `{{[[TODO]]}}` (completed: `{{[[DONE]]}}`) — put it at the START of the block or its checkbox won't toggle. Headings: `#`/`##`/`###` at the start of a block (only H1–H3 exist; `####`+ clamps to H3). In bullet-list markdown (lines starting with `-`) your indentation IS the structure — a heading stays a flat label and does NOT nest the blocks after it, so nest by indenting; only plain-line (non-bulleted) markdown slurps content under a heading. Attributes `Name:: value` (double colon) create queryable metadata.",
  "",
  "LINKS. `[[Page Name]]` (page link + backlink; creates the page if absent), `#tag` / `#[[multi word]]`, `((uid))` (block reference), alias `[label]([[Page]])` / `[label](((uid)))` / `[label](https://url)`. Mention an entity — link it.",
  "",
  "TABLES & LISTS (create ops only). In create_page / create_block markdown, write a normal pipe table — Roam converts it to a `{{[[table]]}}` block with nested children (it reads back as nested blocks, not a pipe table). Do NOT write `1.` / `2.` for a numbered list — the markers are dropped or stored literally; numbered display comes from `childrenViewType` on the parent (see WRITING).",
  "",
  "COMPONENTS. Write the `{{[[name]]: arg}}` form (the `/name` slash command is a UI-only editor shortcut, not for MCP writes): table, kanban, video, mermaid, embed (`{{embed: ((uid))}}`), query (`{{query: {and: [[A]] {not: [[B]]}}}}`), calc, and more. A `((uid))` points at a block; an embed renders a live editable copy — don't conflate them.",
  "",
  "ESCAPING (only when writing ABOUT syntax). Markup renders live, which is what you want when you mean it. If your text documents syntax — explaining how `[[links]]` or `{{[[TODO]]}}` work — wrap the example in `inline code` so it doesn't become a real page, ref, or checkbox.",
  "",
  "WRITING — create parses, update_block is literal. create_page / create_block take markdown and PARSE it (everything above: `__italics__`, `#` headings, nested bullets, pipe tables → `{{[[table]]}}`). update_block sets ONE block's string LITERALLY — no markdown parse, no new children — so use it for text edits and its display params (`heading` 0–3; `childrenViewType`), and use create_block for new nested/structured content. `childrenViewType` (`numbered`|`document`) is a param on create_page, update_page, and update_block — NOT create_block; to make a new block's children numbered, create it, then update_block its uid.",
  "",
  "WRITING BACK a line you read. For update_block, pass only the block-content portion — drop the leading `- ` / indentation and the trailing `<roam …/>` tag — but KEEP any `((uid))<ref>preview</ref>` intact; the server reduces it to `((uid))`. Do NOT pass the display-cleaned text (the preview without its `((uid))`), which would replace a live reference with static text. If you strip annotations by hand, remove `<ref>preview</ref>` while keeping its preceding `((uid))`.",
  "",
  "WHEN THIS ISN'T ENOUGH: (1) you already have this graph's own conventions from get_graph_guidelines — follow them; (2) search THIS graph (the search tool, then get_page / get_backlinks) for prior art and match what already works; (3) for full syntax and components, read Roam's hosted help at https://roamresearch.com/#/app/help .",
].join("\n");
