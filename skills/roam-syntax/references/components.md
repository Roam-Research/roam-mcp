# Roam components — the `{{...}}` family

Examples are in `code` so they stay literal. For MCP writes, write the **`{{[[name]]: arg}}` form** —
the `/name` slash command is a UI-only editor shortcut and does nothing in a written block string.

## Tables

- **To write a table, write a normal pipe table** and let `create_page` / `create_block` convert it —
  do not hand-build the nested form.
- Roam stores it as a `{{[[table]]}}` block whose **children are the data**: each first-level child is
  a **row**, and each deeper level within a row is the next **column** across; the first row reads as
  headers. That's also how it reads back (nested blocks, not a pipe table). To edit one cell, target
  that cell's block by uid.

## Kanban

```
{{[[kanban]]}}
```

First-level children = columns (can be `[[page]]` refs); their children = cards; deeper nesting = card
detail. Cards are directly editable; the board can open in the sidebar.

## Video, mermaid, diagram

```
{{[[video]]: https://youtube.com/...}}   YouTube / Vimeo / Loom
{{[[mermaid]]}}                          diagram source in child blocks (first child sets the type)
{{diagram: Title}}                       2D canvas; each node IS a real block (appears in its references)
```

Per-mermaid theme: first child line `%%{init: {"theme":"forest"}}%%`.

## Embeds and references

```
((uid))                    block reference — inline link showing the block's text
{{embed: ((uid))}}         block embed — a live, editable portal (block + its children)
{{embed-children: ((uid))}}   children only
{{embed-path: ((uid))}}       embed with a clickable breadcrumb path
{{embed: [[Page Name]]}}   page embed
```

A `((uid))` points at a block; an embed renders a live editable copy — don't conflate them.

## Mentions, calc, render, css

```
{{[[mentions]]: [[Page]]}}           inline a page's linked + unlinked references
{{children-mentions: [[Page]]}}      inline the children of those mentions
{{calc: 4 + 5}}                      inline calculator; block-ref args scrape the first number in the block
{{roam/render: ((codeUid))}}         render a referenced code block as a component (JS/JSX)
{{[[roam/css]]}}                     a child fenced `css` block applies graph-wide styling
{{iframe: https://url}}              embed a live webpage
```

## Misc

```
{{[[video-timestamp]]: ((videoUid)) HH:MM:SS}}   timestamp under a video
{{character-count}} / {{word-count}}             count the containing block
{{date}}                                          date-picker that inserts a date-page ref
{{[[slider]]}}                                    inline rating control (e.g. certainty:: {{[[slider]]}})
{{[[streak]]: [[Goal]]}}                          heatmap of how often a ref appears in daily notes
{{encrypt}}                                       password-protected block — write the bare `{{encrypt}}`;
                                                  Roam turns it into `encrypt:<ciphertext>` after the user
                                                  supplies content + a password (password unrecoverable)
```

Hiccup: a block starting with `:hiccup` renders a Clojure/Hiccup vector as HTML, e.g.
`:hiccup [:iframe {:width "600" :src "https://..."}]`.

> Some of these are lightly documented in Roam's help; if a component doesn't behave as described,
> verify against Roam's hosted help before relying on it.
