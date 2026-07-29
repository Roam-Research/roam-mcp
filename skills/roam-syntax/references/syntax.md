# Roam-flavored markdown — full reference

Contents: [WRONG-vs-RIGHT table](#complete-wrong-vs-right-table) ·
[Inline formatting](#inline-formatting) · [Links & references](#links-and-references) ·
[Headings](#headings) · [Block structure & view types](#block-structure-and-view-types) ·
[Blockquotes / callouts / code / images](#blockquotes-callouts-code-images-rules) ·
[Attributes](#attributes) · [Class-tag styling](#class-tag-styling)

Roam's markdown is **not** standard markdown. Examples here are shown in `code` so they stay literal;
type them without the backticks to make them live.

## Complete WRONG vs RIGHT table

| You want        | Use this (Roam)                                    | NOT (standard markdown)              |
| --------------- | -------------------------------------------------- | ------------------------------------ |
| Italics         | `__text__`                                         | `*text*` / `_text_` (see note)       |
| Bold            | `**text**`                                         | `__text__` (that's italics in Roam)  |
| Highlight       | `^^text^^`                                         | no standard equivalent               |
| Strikethrough   | `~~text~~`                                         | same                                 |
| Checkbox / task | `{{[[TODO]]}}` / `{{[[DONE]]}}` **at block start** | `- [ ]` / `- [x]`                    |
| Heading         | `#` / `##` / `###` at block start (H1–H3 only)     | `####`–`######` (clamp to H3)        |
| Numbered list   | `childrenViewType: "numbered"` on the parent       | `1.` / `2.` markers                  |
| Table           | write a **pipe table** — create ops convert it     | hand-building `{{[[table]]}}` blocks |
| Soft line break | `\n` in the block string (Shift+Enter in the UI)   | two trailing spaces                  |
| Horizontal rule | `---` alone in a block                             | `---` mixed with other content       |
| H4–H6           | not supported — only H1–H3                         | `####`+                              |
| Footnote        | a block reference `((uid))`                        | `[^1]`                               |
| Raw HTML        | `:hiccup[...]`                                     | `<hr>`, `<b>`, etc.                  |

## Inline formatting

| Syntax       | Renders as    | vs standard markdown                           |
| ------------ | ------------- | ---------------------------------------------- |
| `**text**`   | **bold**      | same                                           |
| `__text__`   | _italics_     | **DIFFERENT** — standard MD reads `__` as bold |
| `~~text~~`   | strikethrough | same                                           |
| `^^text^^`   | highlight     | Roam-only                                      |
| `` `text` `` | inline code   | same                                           |
| `$$KaTeX$$`  | rendered math | `$$…$$` for inline math                        |

> **Italics note:** Roam's canonical stored form is `__text__`. `update_block` stores its string
> literally, so `*text*` / `_text_` written there stay as plain characters (not italics).
> `create_page` / `create_block` **parse** markdown and normalize `*text*` / `_text_` to `__text__`.
> Always write `__text__` so a block round-trips the same on read and write.

## Links and references

```
[[Page Name]]         page link + backlink; creates the page if absent
#tag                  same as [[tag]], styled gray
#[[Multi Word Tag]]   same as [[Multi Word Tag]], styled gray
((uid))               block reference (uids are usually ~9 chars but can vary — preserve them, never invent)
```

`[[Page]]` and `#Page`/`#[[Page]]` are functionally identical (both create the page + a backlink); `#`
just renders gray. **Mention an entity → link it.**

### Aliases

```
[label]([[Page Name]])     aliased page link
[label](((uid)))           aliased block link
[label](https://url)       external link (same as standard markdown)
```

### Embeds vs block references

```
((uid))                    block REFERENCE — shows the block's text inline as a link
{{embed: ((uid))}}         block EMBED — a live, editable portal to the block (and its children)
{{embed: [[Page Name]]}}   page embed — the whole page inline
```

A `((uid))` reference and a `{{embed:}}` are different: a ref points at a block; an embed renders a
live editable copy. Don't conflate them. (Full component list: `references/components.md`.)

> **On read:** a block reference comes back as `((uid))<ref>preview</ref>` — the `<ref>` holds the
> referenced block's resolved text. See `references/reading-writing-via-mcp.md`.

## Headings

```
# Heading 1
## Heading 2
### Heading 3
```

Only H1–H3 exist. A heading is a **block-level property** — the whole block becomes a heading. When
you pass heading markdown to `create_page`/`create_block`, the `#` is consumed into the block's
`heading` attribute and stripped from the text; on read it comes back on the `<roam heading="N"/>` tag,
not as a `#` prefix. To set/clear a heading on an existing block, use `update_block`'s `heading` param
(a `#` written into an `update_block` string is stored as literal text).

**In bullet-list markdown, a heading does not nest the blocks after it** — indent to nest.

## Block structure and view types

Every bullet is a **block** (the atomic unit) with a stable uid. Nesting = parent/child. Soft line
break within a block = `\n`.

| `childrenViewType` | Effect                                  |
| ------------------ | --------------------------------------- |
| `bullet`           | default bulleted list                   |
| `numbered`         | numbered list (replaces `1.` `2.` `3.`) |
| `document`         | no bullets, document-like               |

Set via `create_page` / `update_page` / `update_block` (NOT `create_block`).

## Blockquotes, callouts, code, images, rules

```
> quoted text
```

Callouts (styled blockquotes with an icon):

```
[[>]] [[!TIP]] Title
Body on the next line (Shift+Enter → \n in the block string)
```

Types: `NOTE INFO SUMMARY TIP SUCCESS QUESTION WARNING FAILURE DANGER BUG EXAMPLE QUOTE` (append `+`/`-`
to fold, e.g. `[[!TIP]]+`).

Code: `` `inline` `` and fenced blocks with a language tag (held in one block). Don't leave a
trailing newline before the closing fence — through `update_block` (literal) it's stored verbatim
and Roam doesn't render it right (create ops normalize it away). Images:
`![alt](https://url)` (`/upload` is a UI-only editor command). The **local/Desktop MCP** has a
`file_upload` tool — upload, then write its returned URL as `![](url)`; the **hosted MCP has no upload
tool**, so reference an already-hosted image URL. Horizontal rule: `---` alone in a block.

## Attributes

```
Name:: value
```

A double colon creates a queryable **attribute** (a single `:` or `**bold:**` does not). Values can be
text, `[[page]]`, `#tag`, or child blocks. A page-level `Type:: #TypeName` (multi-type allowed, e.g.
`Type:: #Project #Blog`) shows a typed chip. Attributes are queryable — see `references/queries.md`.

## Class-tag styling

Any `#.classname` adds that CSS class to the block (Tailwind + Blueprint ship built in). Layout ones:
`#.rm-E` (show first-level children inline), `#.rm-g` (promote children up a level; use `[[.rm-g]]` to
keep the container visible).

**Hidden from the AI:** a block tagged `#.rm-hide` or `#.rm-private` — and its whole subtree — is
**omitted from what the read tools return** (`get_page`, `get_block`, `search`, …), so you won't see it
at all. `#.rm-hide` hides from the AI specifically; `#.rm-private` is Roam's "hidden from other users"
tag (both also collapse the block in the UI). Don't assume you've seen a full page — hidden subtrees
leave no marker in the output.
