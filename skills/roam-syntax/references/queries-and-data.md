# Roam queries — {{query}} clauses and :q Datalog

Every example is shown in `code` so it stays literal — type it without the backticks to make it live.

## Queries

- Form `{{query: {and: [[A]] {not: [[B]]}}}}` (the `{{[[query]]: ...}}` form also renders; `/query` inserts).
- Clauses
  - `{and:}` / `{or:}` match a block (or its parent) containing the refs; `{not:}` excludes; operands can mix `[[page refs]]` and `((block refs))`.
  - `{search: text}` is a sub-clause nested inside `{and:}`/`{or:}`, never standalone; multiple can combine, e.g. `{{query: {and: {search: June} {search: mobile}}}}`.
  - `{between: [[start]] [[end]]}` works on Daily Notes pages ONLY; accepts `[[today]]` `[[tomorrow]]` `[[yesterday]]` `[[last week]]` `[[next week]]` `[[last month]]` `[[next month]]`.
  - `{created-by: [[User]]}`, `{edited-by: [[User]]}`, `{by: [[User]]}`.
- Queries also have UI controls for sorting and filtering, plus a "Nest under parent results" display option. Source: Query.md, Change Log.md.

## Datalog (advanced)

- A `:q` block, written inline after `:q` (optionally with a quoted title) OR with a fenced `clojure` `[:find ... :where ...]` query.
  - A scalar find (`(count ?b) .`) shows inline; a relation renders as a table; a var whose name contains `uid` renders as a clickable block/page view.
- Special symbols
  - `current/*` — page/block id, uid, title; `main-window-*` variants for sidebar queries that auto-refresh when the main window changes.
  - `ms/*` — millisecond bounds for `:create/time`/`:edit/time`; offsets like `ms/+1M-start`, absolute `ms/=2025-01-01-start` (note `ms/+1W-end` is not `ms/+7D-end`).
  - `dnp/*` — resolve to a daily-note page-title STRING, not a timestamp (e.g. `dnp/today`, `dnp/=2025-01-01`).
- Inbuilt rules (custom rules NOT supported): `(created-by)` `(edited-by)` `(by)` `(refs-page)` `(block-or-parent-refs-page)` `(created-between)` `(edited-between)` `(in-dnp-between)` `(refs-dnp-between)` `(in-or-refs-dnp-between)` `(in-dnp)` `(refs-dnp)` `(in-or-refs-dnp)`.
- Works via the frontend `window.roamAlphaAPI.data.q`; the backend `/api/graph/{name}/q` does NOT support these additions. Source: Roam-specific :q additions.md, Examples of :q query blocks.md.
- Raw datascript schema (what `:where` clauses match): pages have `:node/title`; blocks have `:block/string` (text), `:block/uid`, `:block/order` (position under parent), `:block/page`, `:block/children` (immediate), `:block/parents` (all ancestors), `:block/refs` (outgoing refs), `:block/heading` (1–3), `:block/text-align`, `:children/view-type` (`bullet`/`document`/`numbered`); both carry `:create/time` / `:edit/time` (epoch ms) and `:create/email` / `:edit/email` (the attribution behind `created-by`/`edited-by`). Pull a tree: `[:find (pull ?e [* {:block/children [*]}]) :where [?e :node/title "Page"]]`. Source: Examples of :q query blocks.md, JSON Schema.md.
