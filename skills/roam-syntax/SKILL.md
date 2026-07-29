---
name: roam-syntax
description: >
  Write and read content in a Roam Research graph correctly. Roam's markdown differs from standard
  markdown, and its MCP tools render block metadata (headings, block references, view types) into a
  wire format you must handle when writing content back. Use this whenever creating, editing,
  searching, or organizing content in a Roam graph — including via the roam-mcp tools (create_page,
  create_block, update_block, get_page, get_block, search) — or when you encounter Roam syntax like
  [[page links]], ((block refs)), #tags, {{[[TODO]]}}, attribute:: values, {{[[query]]}}, or
  <roam .../> tags, even if the user doesn't say "Roam". Covers writing syntax, reading tagged output
  without losing block references, queries, components, and graph conventions. Not for
  standard-markdown files or non-Roam note apps.
---

# Roam syntax

You're working in a Roam Research graph — an **outliner**, not a document editor. A page is a tree of
**blocks** (one bullet = one block); nesting (indentation) is the structure, and `[[links]]` /
`((block refs))` are the point. Use the graph; don't dump flat prose into it.

Two rules dominate everything else:

1. **Roam's markdown is not standard markdown** — the differences below silently corrupt content or
   pollute the graph if you use standard-markdown habits.
2. **Reads return a rendered wire format; `update_block` writes literally.** Handle the `<roam .../>`
   tags and `((uid))<ref>...</ref>` block-ref previews correctly or you'll destroy references on
   write-back.

When working through the roam-mcp tools, call `get_graph_guidelines` before your first read or write in
a graph — it returns the user's own conventions plus a compact `roamSyntax` summary of the gotchas
below.

## Gotchas (the highest-signal part — read this)

### Writing: Roam markdown ≠ standard markdown

| You want        | Use this (Roam)                                           | NOT (standard markdown)            |
| --------------- | --------------------------------------------------------- | ---------------------------------- |
| Italics         | `__text__` (double underscore)                            | `*text*` / `_text_` (see note)     |
| Bold            | `**text**`                                                | `__text__` (that's italics)        |
| Highlight       | `^^text^^`                                                | —                                  |
| Strikethrough   | `~~text~~`                                                | —                                  |
| Checkbox / task | `{{[[TODO]]}}` / `{{[[DONE]]}}` **at block start**        | `- [ ]` / `- [x]`                  |
| Heading         | `#` / `##` / `###` at block start (H1–H3 only; `####`→H3) | `####`+                            |
| Numbered list   | `childrenViewType: "numbered"` on the parent              | `1.` / `2.` markers                |
| Table           | write a **pipe table** — create ops convert it            | hand-building `{{[[table]]}}`      |
| Nesting         | **indent** child blocks                                   | headings do NOT slurp what follows |

- **Italics is `__text__`.** On `update_block` (literal), `*text*` / `_text_` are stored as-is and
  render as plain characters; `create_page` / `create_block` normalize them to `__text__`. Always write
  `__text__` so reads and writes agree.
- `{{[[TODO]]}}` renders a checkbox anywhere, but it must **lead the block** or clicking it won't
  toggle to `{{[[DONE]]}}`.
- Headings are structural, but in **bullet-list markdown they stay flat** — a heading does not pull
  the blocks after it in as children. Nest by indenting. (`####`+ silently clamps to H3.)

### create parses; `update_block` is literal

- `create_page` / `create_block` **parse** the markdown you pass (all the syntax above; a pipe table
  becomes a `{{[[table]]}}` block; nested bullets become a block tree).
- `update_block` stores its `string` **literally** — no markdown parse, no new children. Use it for
  text edits; use its params `heading` (0–3) and `childrenViewType` (`bullet`/`numbered`/`document`)
  for structure, and `create_block` for new nested content.
- `childrenViewType` is a param on `create_page` / `update_page` / `update_block` — **not**
  `create_block`. To make a new block's children numbered: create it, then `update_block` its uid.

### The escape rule (avoid polluting the graph)

Markup renders **live** when written. If your text is _documenting_ syntax (e.g. explaining how
`[[links]]` or `{{[[TODO]]}}` work), wrap the examples in `` `inline code` `` — otherwise you create
real pages, refs, and checkboxes.

## Reading Roam output

`get_page` / `get_block` / `search` / `get_backlinks` / `get_comments` / `roam_query` /
`semantic_search` return **rendered** markdown, one block per line:

```
- <content> <roam uid="…" heading="2" childrenViewType="numbered" refs="3" hiddenChildren="1"/>
```

- The trailing **`<roam .../>` tag** carries metadata: `uid` (always — use for follow-up calls),
  optional `heading` (1–3), `childrenViewType`, `refs` (backlink count — high = edit with care),
  `hiddenChildren="N"` (the subtree was truncated by `maxDepth`; read deeper with a higher `maxDepth`
  before assuming you've seen everything), and `truncated="N"` (search/semantic results only: N
  characters of a long block were cut — `get_block` the uid for the full text **before editing it**,
  or a write-back would overwrite the block with just the visible prefix).
- **Strip the whole `<roam .../>` tag** before showing content to the user. When **quoting or showing**
  the user their own notes, reproduce the text **verbatim** (don't silently reword or reformat). When
  the user explicitly asks you to summarize or transform, do that.
- A **block reference** reads as `((uid))<ref>preview</ref>`, where `<ref>` holds the referenced
  block's text. When **displaying**, show the preview text and drop the `((uid))` + tag.

## Writing

- **New content** → `create_page` / `create_block` with markdown (parsed). Build hierarchy by
  indenting; use headings as labels, not as containers.
- **Editing an existing block's text** → `update_block` (literal). Structure/display via its `heading`
  / `childrenViewType` params.
- **Write-back is the dangerous case.** When you edit a block you read, pass **only the content** to
  `update_block`:
  - drop the leading `- ` / indentation and the trailing `<roam .../>` tag (they are not part of the
    block string), **but**
  - **keep any `((uid))<ref>...</ref>` intact** — the server decodes it back to `((uid))`.
  - Do **not** write the display-cleaned preview alone (the `<ref>` text without its `((uid))`) — that
    replaces the live reference with static text. A tags-only strip that leaves the preview behind
    stores it as duplicate content.

See `references/reading-writing-via-mcp.md` for worked read→edit→write examples that don't lose refs,
and why the round-trip behaves this way.

## Behavioral doctrine

These are **defaults for when the user hasn't asked for a specific change** — explicit user intent
always wins, and so does anything in the graph's own `[[roam/agent guidelines]]` (returned by
`get_graph_guidelines`). If the user says "fix / rewrite / delete this block," do exactly that.

- **One fact per block.** Nest details under a short lead block instead of writing long blocks —
  blocks are the unit of reference, so long prose blocks defeat the outliner.
- **Don't duplicate content across blocks or pages** — link it with `((block refs))` or
  `[[page refs]]` instead.
- **Append over edit.** Under ambiguity, add a child or sibling block rather than modifying existing
  content — especially human-authored blocks.
- **Comment, don't rewrite.** To give feedback on someone's block, use `add_comment`, which preserves
  the original.
- **Daily note is the safe fallback.** If unsure where content belongs, today's daily note is almost
  always right.
- **Don't move or delete without explicit permission** — both can silently destroy meaning; a delete
  also rewrites every block that referenced the target.
- **Respect load-bearing blocks.** A block with a high `refs` count is structurally important — edit
  it with extra care.
- **Link liberally, but don't fabricate block refs.** Write `[[Page]]` freely (it creates the page +
  a backlink). Use `((uid))` only for blocks already in your working context — don't search the graph
  just to manufacture a block ref.
- **Search before create; read before write.** Check whether a page/section already exists, and read
  existing content before changing it.

## Reference files — load the one you need

- `references/syntax.md` — full Roam-flavored markdown: inline formatting, links / refs / aliases /
  embeds, headings, callouts, attributes, code, images, separators, class-tag styling, and the
  complete WRONG-vs-RIGHT table. **Load when** writing anything beyond the gotchas above.
- `references/components.md` — the `{{...}}` component family (table, kanban, video, mermaid, embed
  variants, mentions, calc, roam/render, roam/css, slider, …). **Load when** inserting a component.
- `references/queries.md` — `{{query}}` clauses/operators and page-ref inheritance, plus `:q` Datalog
  (run via the `datalog_query` tool) and the datascript schema. **Load when** building a query.
- `references/reading-writing-via-mcp.md` — how the MCP render-on-read / literal-on-write model works,
  the round-trip / decode behavior, and which tool to use for what. **Load when** editing content you
  read back, or unsure which write tool to use.

## Compatibility

Assumes a Roam Research graph, typically via the roam-mcp MCP server / CLI (npm
`@roam-research/roam-mcp`). The syntax guidance also applies to hand-writing Roam markdown.
