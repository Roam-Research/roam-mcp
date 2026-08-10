# Reading & writing via the roam-mcp tools

Contents: [Core model](#the-core-model-reads-render-update_block-writes-literally) ·
[The `<roam>` tag](#the-roam-tag) · [Write-back trap](#-the-write-back-trap-dont-lose-block-references) ·
[Which tool for what](#which-tool-for-what) · [Transport note](#transport-note)

## The core model: reads render, `update_block` writes literally

- **Reads** (`get_page`, `get_block`, `search`, `get_backlinks`, `get_comments`, `roam_query`,
  `semantic_search`) return a **rendered wire format**, not the raw block text. Each block is one line:

  ```
  - <content> <roam uid="…" heading="2" childrenViewType="numbered" refs="3" hiddenChildren="1"/>
  ```

  The `<roam .../>` tag carries metadata (see the tag table below); a block reference renders as
  `((uid))<ref>preview</ref>` with the referenced block's text inside `<ref>`.

- **`create_page` / `create_block`** _parse_ the markdown you pass (italics, headings, nested bullets,
  pipe tables → `{{[[table]]}}`, etc.).

- **`update_block`** stores its `string` **literally** — no parse, no new children. Its structural
  effects come from params, not markup: `heading` (0–3), `childrenViewType`
  (`bullet`/`numbered`/`document`), plus text alignment / open state.

`datalog_query` on `:block/string` is the only way to see the **raw** stored text — useful to verify a
write actually stored what you intended.

## The `<roam>` tag

| Attr               | Meaning                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `uid`              | the handle for follow-up operations (get_block, update_block, refs…); should be on every block       |
| `heading`          | 1–3, only when the block is a heading                                                                |
| `childrenViewType` | `numbered`/`document`, only when not a plain bullet                                                  |
| `refs`             | how many blocks reference this one; high = structurally important, edit with care                    |
| `hiddenChildren`   | the subtree was cut off by `maxDepth`; read deeper before assuming you saw all                       |
| `truncated`        | (search/semantic results only) N chars of this block were cut; `get_block` the uid for the full text |

**Strip the whole `<roam .../>` tag before showing content to a user.** Honor `heading` /
`childrenViewType` when reconstructing structure.

**If a tag has no `uid`**, that block's stored uid is invalid (rare — legacy or imported content)
and the block **cannot be addressed**: `update_block`, `delete_block` and `move_block` all require
a uid, and the server rejects invalid ones anyway. Leave it alone — read it, but don't invent a
uid and don't re-create its content elsewhere to work around it. That includes a `truncated="N"`
hit with no `uid`: there's no way to fetch the full text, so don't edit it from the visible prefix.

## 🐛 The write-back trap (don't lose block references)

The rendered line you read is **not** a valid block string to pass back. The server _does_ decode the
wire annotations on write (it reduces `((uid))<ref>...</ref>` → `((uid))` and drops stray `<roam .../>`
tags), but it does **not** strip the leading `- `/indentation — `update_block` would store that
literally. And if you "clean up" the line by dropping the `((uid))` and keeping the preview text, you
silently replace a live reference with a static copy.

**Correct write-back:** pass only the **block content** to `update_block` —

1. drop the leading `- ` / indentation and the trailing `<roam .../>` tag, **but**
2. **keep any `((uid))<ref>...</ref>` intact** (the server reduces it to `((uid))`).

### Worked example

Read:

```
  - Follow up on ((k4B2xY9pL))<ref>ship the auth fix</ref> before Friday <roam uid="a1b2c3d4e"/>
```

Edit the text, keeping the ref annotation, and write just the content:

```jsonc
update_block({
  uid: "a1b2c3d4e",
  string: "Follow up on ((k4B2xY9pL))<ref>ship the auth fix</ref> before MONDAY"
})
```

Stored `:block/string` afterward (server decoded the `<ref>`):

```
Follow up on ((k4B2xY9pL)) before MONDAY
```

The `((k4B2xY9pL))` reference is still live. **Wrong** would have been to pass
`"Follow up on ship the auth fix before MONDAY"` (ref replaced by frozen text), or to include the
leading `- ` (the server decodes the `<roam>` tag away, but the bullet is stored literally).

If you strip annotations by hand instead of relying on the decode, remove `<ref>preview</ref>` while
keeping its preceding `((uid))` — a tags-only strip leaves the preview as duplicate content.

**Editing inside a `<ref>…</ref>` preview is a silent no-op**: the server reduces the whole
annotation to `((uid))` and discards your changes (the call still returns success). To change the
previewed text itself: `get_block` the **referenced** uid, then apply the normal write-back to its
full returned content. Never reconstruct the block from the preview — previews are not canonical
source (they can be capped, and nested refs are resolved inside them).

## Which tool for what

| Goal                              | Tool                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| New page (optionally with body)   | `create_page` (parses markdown)                                                                    |
| New block(s), possibly nested     | `create_block` (parses markdown; target by parentUid/pageTitle/dailyNotePage; `nestUnder` a child) |
| Quick capture to a daily note     | `append_to_daily_note` (append-only; parses markdown trees like the create ops)                    |
| Edit one block's text             | `update_block` (literal string; + `heading`/`childrenViewType` params)                             |
| Reorder / reparent a block        | `move_block`                                                                                       |
| Set a heading / numbered children | `update_block` params (not `#` / `1.` in the string)                                               |
| Comment on a human's block        | `add_comment` (preserves the original)                                                             |
| Delete                            | `delete_block` / `delete_page` (irreversible; rewrites referrers — confirm first)                  |

- `create_page` does populate a body from `markdown` — you do **not** need a follow-up `create_block`.
- A numbered list = create the parent, then `update_block(uid, childrenViewType: "numbered")` —
  `childrenViewType` is not a `create_block` param.

## Transport note

There are two servers (local Desktop, hosted/remote) sharing the parsing/rendering code, so this model
holds on both — with one accepted difference: ordered-list markers (`1.`) are **not portable**. The
local parser keeps them as literal text; the hosted parser strips them and, when they're nested under
a bullet, may convert the parent to a numbered view. Never rely on them — set `childrenViewType`
explicitly.

A genuine user alias `[label](((uid)))` is distinct from a block reference: the alias stays raw on read
(and writes back unchanged — the server only decodes `((uid))<ref>…</ref>`), while a reference reads as
`((uid))<ref>preview</ref>`. So you can tell them apart, and both round-trip safely.
