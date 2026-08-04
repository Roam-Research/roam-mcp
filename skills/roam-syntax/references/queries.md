# Roam queries — `{{query}}` and `:q` Datalog

Contents: [Two systems](#two-systems) · [`{{query}}` syntax](#query-syntax) ·
[`:q` Datalog via `datalog_query`](#q-datalog-advanced--via-the-datalog_query-tool) ·
[Datascript schema](#datascript-schema-what-where-clauses-match) · [Examples](#examples) ·
[`:q` extensions](#q-extensions--custom-symbols--inbuilt-rules)

## Two systems

Choose by use case:

| System       | When                                             | How                                                             |
| ------------ | ------------------------------------------------ | --------------------------------------------------------------- |
| `{{query}}`  | user wants a live, visible query on a page       | write it as block content; the `roam_query` tool also runs it   |
| `:q` Datalog | precise/graph-wide retrieval, joins, aggregation | a `:q` block; run programmatically via the `datalog_query` tool |

**Tool mapping (important):** the `roam_query` tool runs `{{query}}` blocks, **NOT** Datalog. Run
Datalog with the **`datalog_query`** tool.

## `{{query}}` syntax

```
{{[[query]]: {and: [[Project Alpha]] [[TODO]] {not: [[DONE]]}}}}
```

Operators:

- `{and: ...}` / `{or: ...}` — match blocks (or their parent) containing the refs; operands can mix
  `[[page refs]]` and `((block refs))`.
- `{not: ...}` — exclude.
- `{between: [[start]] [[end]]}` — **works on Daily Notes pages only**; accepts date shorthands
  `[[today]]` `[[yesterday]]` `[[last week]]` `[[next month]]`, etc.
- `{search: text}` — a **sub-clause nested inside** `{and:}`/`{or:}`, never standalone, e.g.
  `{and: {search: June} {search: mobile}}`.
- `{created-by: [[User]]}`, `{edited-by: [[User]]}`, `{by: [[User]]}`.

Reference operands must use Roam ref syntax — `[[Page]]` or `((uid))` — not bare or quoted text
(`{search:}` is the text-search exception):

| Wrong                       | Right                                 |
| --------------------------- | ------------------------------------- |
| `{and: TODO}`               | `{and: [[TODO]]}`                     |
| `{and: "project alpha"}`    | `{and: [[project alpha]]}`            |
| `{between: 2026-03-10 ...}` | `{between: [[March 10th, 2026]] ...}` |

### Page-ref inheritance (non-obvious — the thing agents miss)

A child block **inherits its parent's `[[refs]]`** for query matching. So
`{and: [[TODO]] [[Project Alpha]]}` matches a `{{[[TODO]]}}` block nested under a block that references
`[[Project Alpha]]`, even though that TODO block doesn't literally contain `[[Project Alpha]]`.
Consequences:

- Don't redundantly tag every child with the same page ref.
- Do tag a child explicitly if you want it to match **independently** of its parent.
- Query results may include blocks whose matching ref sits on a **parent**, not the block itself.

### `{{query}}` vs `search`

`{{query}}` / `roam_query` match **references** (`[[page]]`/`((block))`), not free text. For full-text
matching use the `search` tool (or a `{search:}` sub-clause inside a query).

## `:q` Datalog (advanced) — via the `datalog_query` tool

Use Datalog when `{{query}}` can't express it: attribute values, joins across entities, aggregation,
edit-time filters, arbitrary dates.

> **In `datalog_query`, plain DataScript is the portable subset.** The `:q` extensions — `ms/*` /
> `dnp/*` date symbols and the inbuilt rules (`created-by`, `refs-page`, `created-between`, …) — are
> preprocessed by the **local/Desktop** transport, so they work there; the **hosted/remote** transport
> does **not** support them. `current/*` works on neither (no page context
> outside a `:q` block). For a query that runs on any transport, use raw attributes (`:create/time`
> epoch ms, `:block/refs`, `:node/title`), literal millisecond timestamps, and explicit `:where`
> clauses. The extensions are listed at the bottom (native in `:q` blocks; Desktop-only in
> `datalog_query`).

### Datascript schema (what `:where` clauses match)

- **Pages**: `:node/title`.
- **Blocks**: `:block/string` (raw text), `:block/uid`, `:block/order` (position under parent),
  `:block/page`, `:block/children` (immediate), `:block/parents` (all ancestors), `:block/refs`
  (outgoing refs), `:block/heading` (1–3), `:children/view-type` (`bullet`/`numbered`/`document`).
- **Both**: `:create/time` / `:edit/time` (epoch ms), and `:create/user` / `:edit/user` — references to
  the **user entity** (the attribution behind `created-by` / `edited-by`). A user entity has `:user/uid`
  (stable, present on ALL users) and `:user/display-page`. **`:user/email` exists only on human users** —
  API-token and AI writers are non-human user entities with no email, so a query joined on `:user/email`
  silently drops their blocks. Match on `:user/uid` (or `:user/display-page`) to cover all authors.

> **`:block/string` is the RAW stored text** — the only way to see what Roam actually stored (reads via
> `get_page`/`get_block` return the rendered wire format instead). Handy for verifying writes.

### Examples

```clojure
;; blocks referencing a page (forward datom: the block's :block/refs points at the page)
[:find ?uid :where [?p :node/title "Project Alpha"] [?b :block/refs ?p] [?b :block/uid ?uid]]

;; open TODOs (TODO ref, not DONE ref)
[:find ?uid ?s
 :where [?todo :node/title "TODO"] [?done :node/title "DONE"]
        [?b :block/refs ?todo] [?b :block/string ?s] [?b :block/uid ?uid]
        (not [?b :block/refs ?done])]

;; pull a page + its full block tree. `...` recurses; add `:limit nil` or DataScript silently caps
;; cardinality-many children at 1000. (`[*]` alone is immediate children only.)
[:find (pull ?e [* {[:block/children :limit nil] ...}]) :where [?e :node/title "Page Name"]]

;; a scalar aggregate — `.` returns a single value (shown inline in a :q block)
[:find (count ?page) . :where [?page :node/title _]]

;; pages whose title contains "API", with their create time (epoch ms).
;; NOTE: DataScript relations are UNORDERED — sort ?create-time descending client-side for newest-first.
[:find ?page-uid ?create-time
 :where [?page :node/title ?t] [(clojure.string/includes? ?t "API")]
        [?page :block/uid ?page-uid] [?page :create/time ?create-time]]
```

### `:q` extensions — custom symbols & inbuilt rules

`:q` blocks in a graph (and the frontend `window.roamAlphaAPI.data.q`) support extra symbols and rules.
In `datalog_query` these work only on the **local/Desktop** transport (except `current/*`, which needs a
`:q`-block context); the **hosted** transport supports none of them — so **avoid them in a `datalog_query`
you want to run anywhere**. Listed here mainly for reading `:q` blocks in a user's graph (and, later,
helping author them).

**Custom symbols** (usable directly in `:where`):

- `current/*` — the query's own location: `current/page-title`, `current/page-uid`, `current/block-uid`,
  and `current/main-window-page-title` / `-uid` / `-id` (the page open in the main window; auto-refreshes
  as you navigate — handy for sidebar queries). Has no meaning outside a `:q` block.
- `ms/*` — millisecond bounds for `:create/time` / `:edit/time`. Named: `ms/today-start`,
  `ms/this-week-start`/`-end`, `ms/last-week-start`, `ms/this-month-start`/`-end`, `ms/this-quarter-start`,
  `ms/this-year-start`/`-end`. Offsets: `ms/+1D-start`, `ms/-5D-start`, `ms/+1M-start`, `ms/+1Q-start`,
  and `ms/+1W-end` (= end of NEXT week, **not** `ms/+7D-end`). Absolute: `ms/=2025-01-01-start`.
- `dnp/*` — resolve to a daily-note-page TITLE string (`:node/title`): `dnp/today`, `dnp/yesterday`,
  `dnp/-1D`, `dnp/this-week-start`, `dnp/this-month-start`, `dnp/=2025-01-01` (→ `January 1st, 2025`).

**Inbuilt rules** (custom rules are not supported): `(created-by ?user-name ?block)`,
`(edited-by ?user-name ?block)`, `(by ?user-name ?block)`, `(refs-page ?page-title ?b)`,
`(block-or-parent-refs-page ?page-title ?b)`, `(created-between ?t1 ?t2 ?b)`,
`(edited-between ?t1 ?t2 ?b)`, `(in-dnp-between ?start-dnp ?end-dnp ?b)`, `(refs-dnp-between …)`,
`(in-or-refs-dnp-between …)`, `(in-dnp ?dnp ?b)`, `(refs-dnp ?dnp ?b)`, `(in-or-refs-dnp ?dnp ?b)`.

Example `:q` block (uses a rule + `ms/*` — runs as a `datalog_query` only on local/Desktop, not hosted):

```clojure
:q "Backrefs to a page by a given user this year"
[:find ?b ?t
 :where [?b :block/uid ?uid]
        (refs-page "Quality of Life Improvements" ?b)
        (created-by "Baibhav Bista" ?b)
        [?b :create/time ?t]
        (created-between ms/this-year-start ms/this-year-end ?b)]
```
