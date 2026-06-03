# Roam primitives — blocks, refs & links, formatting, block references & embeds, callouts

Every example is shown in `code` so it stays literal — type it without the backticks to make it live.

## Block model

- A page is a tree of blocks (one bullet = one block); the block tree is the data model.
  - Roam also renders the tree through view types (document / bullet / numbered) and components (`{{[[kanban]]}}`, `{{[[table]]}}`, `{{diagram}}`, `{{[[mermaid]]}}`) — the tree is the substrate, not the only shape.
- Escape rule — when documenting markup, wrap every example in `inline code` or a fenced block. Bare `[[refs]]`, `#tags`, `{{[[TODO]]}}`, `Name::`, and `[[>]] [[!TIP]]` render LIVE and create stray pages, backlinks, checkboxes, and attributes.
- Soft line break — Shift+Enter keeps text in the same block (no new bullet); this is how a pipe-separated tag-footer row sits under a block.

## Refs and links

- Page reference `[[Page Name]]`
  - Bidirectional link (type `[[` to insert); creates the page if absent and collects backlinks in its Linked References.
  - Plain-text mentions of a page's name appear under its Unlinked References, where you can link them in one click.
  - Multi-word names are fine. Source: Page References.md.
- Block reference `((uid))`
  - Points to one block; its text renders inline. `[[` finds pages, `((` finds blocks.
  - uids are usually 9 chars but can be any length (imported uids vary); preserve them, never invent duplicates (collisions fail import).
- Tag `#tag` / `#[[multi word]]`
  - A page reference styled as a grey tag; conventionally placed at the start or end of a block. Source: Tags.md.
- Alias `[label]([[Page]])` / `[label](((uid)))` / `[label](https://url)`
  - Custom display text over a page, block, or URL (default block-alias text is `*`).
  - `Cmd/Ctrl+k` turns selected text into an alias; hover an alias to preview the target. Source: Formatting.md.

## Formatting

- Bold `**text**`. Italics `__text__` — double-underscore is ITALICS in Roam, not bold. Highlight `^^text^^`. Strikethrough `~~text~~`.
- Headings `#` / `##` / `###` (H1–H3 only); a heading is still a block and can carry children and refs.
- Inline `code` (single backticks); fenced code block with a language tag (`javascript`, `css`, `clojure`) held in one block (`/code block`).
- Math `$$KaTeX$$` — can compose inner `$$...$$` from child blocks (Latex.md).
- Blockquote — start a block with `> ` (`>` then a space).
- Image `![alt](https://url)` or `/upload`. `---` on its own block is a horizontal rule. Blocks can be left/center/right/justified. Source: Formatting.md.

## Block references and embeds

- `((uid))` references one block (text renders inline). An embed renders a live, editable COPY — distinct concepts; do not conflate.
- Create a ref — right-click the bullet → Copy Block Ref, or Alt-drag a block, or type `((`. Navigate with `Ctrl-o` (jump) / `Ctrl-Shift-o` (sidebar).
- Context-menu "Replace With" modes
  - `text` — dead copy, link severed.
  - `embed` — live portal; edits propagate.
  - `original` — moves the canonical block here, leaving a ref behind.
  - `alias` — hyperlink.
  - `text and alias` — text + back-pointer; best for drafting.
  - Plus "Apply Children" as text or as references.
- Embed variants
  - `{{embed: ((uid))}}` — the block plus its children.
  - `{{embed-children: ((uid))}}` — children only.
  - `{{embed-path: ((uid))}}` — with a clickable breadcrumb path.
  - Source: Block References.md, Change Log.md (the embed feature pages are empty).

## Callouts

- Styled blockquotes with a type icon and color.
- Create with `[[>]] [[!NOTE]]` (canonical) or `> [!NOTE]`; `/Callout` inserts one; click the icon to change type.
- Title = first line; body = next line via Shift+Enter (same block).
- Foldable — append `+` (expanded) or `-` (collapsed) to the type, e.g. `[[!TIP]]+`; click the header to toggle. Works in heading blocks too.
- 12 types: NOTE INFO SUMMARY TIP SUCCESS QUESTION WARNING FAILURE DANGER BUG EXAMPLE QUOTE.
  - Aliases: tldr/abstract, hint/important, check/done, help/faq, caution/attention, fail/missing, error, cite.
- Custom type → "note" styling + `.rm-callout--{type}` class + `--callout-color`/`--callout-bg` vars (style via a `{{[[roam/css]]}}` block). Source: Callouts.md.
