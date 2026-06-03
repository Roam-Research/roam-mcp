# Roam conventions — daily notes, page shape, finding more, writing via the roam-mcp tools

Every example is shown in `code` so it stays literal — type it without the backticks to make it live.

## Daily notes and dates

- Date pages use Roam's English ordinal format, e.g. `[[February 8th, 2021]]`, `[[January 1st, 2021]]`. `[[today]]` resolves dynamically; `/date` or `{{date}}` inserts a date.
- Date pages are normal pages; blocks written on or referencing them are found via linked references and date queries. Daily Notes are Roam's default landing page and primary capture surface. Source: Daily Notes.md.

## Good page shape

- A few heading blocks (often `[[refs]]`) with content nested under; `---` divides sections.
- The help graph's "card" idiom (a help-graph convention, not a universal rule): `### Title by [[Author]]` → a child media/link → a soft-break footer row of `#[[topic]]` tags.
- Reuse with `((refs))`/`{{embed:}}` when identity or edit-propagation matters; copy text when you want an independent copy.

## Collaboration & multiplayer

"Multiplayer" is a concept cluster — sharing, roles, attribution, comments, reactions, versions — and most of those features never use the word. (`Multiplayer.md` and `User.md` are empty; the detail is in Sharing.md, FAQ.md, Version Control.md, Reactions.md, and the `:q` attribution rules.)

- **Sharing & roles:** a graph can be shared read-only, publicly editable, or with specific emails as readers/editors, by URL or email (three-dot menu → Share; a person needs a Roam account first). Your own MCP token also carries an access level (read-only / read-append / full) that caps what you can write.
- **Attribution:** every block records who created and last edited it (queryable via the `created-by` / `edited-by` / `{by:}` rules). An agent writes as a distinct user — the "AI user", surfaced as `aiUserDisplayName` by `get_graph_guidelines` — so its writes are attributed and visible to collaborators like any other user's.
- **Shared-graph mechanics:** edits and deletions are visible to every collaborator, and Roam's undo does not reliably reverse bulk or API-driven changes. A block can hold multiple drafts/versions (`Ctrl/Cmd+,`; Version Control.md).
- **Comments** are a separate thread on a block (`add_comment` / `get_comments`), distinct from child blocks. **Reactions** are emoji on a block (Reactions.md). `{{[[slider]]}}` lets collaborators rate/vote.

## Where to find more

- You author inside the USER's graph, not Roam's help graph — pages like `[[Query]]`, `[[Kanban]]`, `[[roam/templates]]` may be absent or user-specific here.
- Escalate in order: (1) call `get_graph_guidelines` for graph-specific rules; (2) search THIS graph (the `search` tool, then `get_page` / `get_backlinks`) for prior art and copy the shape that already works; (3) for canonical syntax read Roam's hosted help at https://roamresearch.com/#/app/help and the dev docs at https://roamresearch.com/#/app/developer-documentation .
- If you cannot source a feature, say what is uncertain before writing live syntax.

## Writing via the roam-mcp tools

- `create_page` does not reliably populate its body — create the page, then add content with `create_block` (targets `parentUid`, `pageTitle`, or `dailyNotePage`); it parses nested markdown into the block tree.
- `childrenViewType` = `document` | `bullet` | `numbered`.
- When documenting markup, escape examples (see Block model → Escape rule) so they do not render live.
