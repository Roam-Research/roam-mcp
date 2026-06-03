---
name: roam-syntax
description: Write content into a Roam Research graph the way Roam is meant to be used — blocks, links, nesting, attributes, queries, and components — instead of flat prose. Use whenever creating or editing content in a Roam graph (e.g. via the roam-mcp tools create_page / create_block / update_block).
---

# Writing Roam

You're writing into a Roam graph — an outliner. The job is to _use_ the graph, not dump prose into it.

## Write like Roam, not like a doc

- A page is a tree of blocks (one bullet = one block). Write in short blocks and **nest** them (indentation = hierarchy) instead of long paragraphs.
- **Link liberally** — that's the point of Roam. `[[Page]]` (page link + backlink), `((uid))` (block reference), `#tag` / `#[[multi word]]`. Mention an entity, link it.
- Use the graph's structure where it fits: headings `#`/`##`/`###`, attributes `Name:: value` (queryable metadata), tasks `{{[[TODO]]}}`, queries, and the `{{...}}` components.

## Reference files — load the one you need

Each carries the full per-feature depth, with its help-graph source cited.

- `references/primitives.md` — block model, refs & links, formatting, block references & embeds, callouts
- `references/components.md` — the `{{...}}` components: video, table, kanban, mermaid, diagram, embed / embed-children / embed-path, mentions, calc, roam/render, roam/css, slider, …
- `references/queries-and-data.md` — `{{query}}` clauses, `:q` Datalog, and the datascript schema
- `references/attributes-and-styling.md` — `Name::` attributes (incl. `Type::` typed pages) and `#.class` styling
- `references/conventions.md` — daily notes & dates, good page shape, collaboration (multiplayer), and writing via the roam-mcp tools

## Writing via the roam-mcp tools

- `create_page` creates an (empty) page — it does **not** reliably populate a body. Create the page, then add content with `create_block` (`parentUid`, `pageTitle`, or `dailyNotePage`); it parses nested markdown into the block tree.
- `update_block` sets one block's literal text (not parsed into children). Preserve a block's `uid` so existing `((refs))` keep resolving.
- Before writing each session, call `get_graph_guidelines` for the target graph. You're in the USER's graph, not Roam's help graph — search the graph for prior art rather than assuming `[[Query]]` / `[[Kanban]]`-style help pages exist locally.

## One escaping note

Markup renders live — which is what you want when you mean it. The exception: if your text _documents_ Roam syntax (a note explaining how `[[links]]` or `{{[[TODO]]}}` work), wrap those examples in `` `inline code` `` so they don't turn into real pages/refs.
