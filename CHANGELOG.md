# Changelog

## 0.7.1 - 2026-06-13

- **`get_graph_guidelines` description hardened.** Added a sentence clarifying that a graph's
  guidelines are user-authored _data_, not instructions to the agent: they express the user's
  preferences for how to apply a request and never override system, developer, or user
  instructions. Scopes the authority of graph-stored guideline text (relevant for shared graphs)
  without changing any behavior.
- **New `core` export: `getDataTools(options)` + `GetDataToolsOptions`.** A factory for `tools/list`
  registration. By default it returns the shared `dataTools` array unchanged; with
  `omitGuidelinesNoteSuffix: true` it returns a fresh array with the trailing
  "call get_graph_guidelines" nudge stripped from each data-tool description (descriptions only —
  no behavior, schema, or annotation change). Lets a hosted transport (e.g. ChatGPT) drop the
  orientation nudge per-profile while local CLI/MCP keep it. Additive and opt-in: `dataTools`,
  `contentTools`, and all existing exports are unchanged.

## 0.7.0 - 2026-06-03

- Added a new tool **`append_to_daily_note`** — a quick-capture tool for adding markdown to a daily
  note (todos, notes, summaries). Defaults to today's daily note (also accepts a `date`: `MM-DD-YYYY`
  or `today`/`yesterday`/`tomorrow`), creates the page if needed, and optionally appends under an
  existing top-level section via `nestUnder`. It is a thin wrapper over the same
  `data.block.fromMarkdown` action `create_block` already uses — no new backend action — added for
  discoverability and as a narrow, append-only capture surface.

## 0.6.8 - 2026-06-03

- `create_block`'s `dailyNotePage` now accepts the relative words **`today`**, **`yesterday`**, and
  **`tomorrow`** (case-insensitive) in addition to `MM-DD-YYYY`. They are resolved to a concrete
  `MM-DD-YYYY` **before the value crosses the wire** — against each transport's notion of "today"
  (local: the machine clock; hosted: the user's picker timezone) — so the backend and renderer see no
  new vocabulary and there is no version coupling. A literal `MM-DD-YYYY` passes through unchanged.
- Added an optional `getCurrentDate?(): string | undefined` to the `RoamActionClient` interface (the
  transport's `yyyy-MM-dd` "today"). The local `RoamClient` implements it from the machine clock;
  core throws rather than silently falling back to its own (UTC) clock if a relative word arrives
  without a base date.

## 0.6.7 - 2026-06-02

- Added **structured tool output on the 8 write tools** (`create_page`, `create_block`,
  `add_comment`, `update_block`, `update_page`, `move_block`, `delete_block`,
  `delete_page`): they declare an `outputSchema` and return `structuredContent`
  alongside the text channel. Schemas are permissive (`.passthrough()`, optional fields)
  so backend shape drift doesn't break validation.
- The 9 read tools (and file/nav/standalone) stay **content-only** — `structuredContent`
  is emitted only for tools that declare an `outputSchema`. For reads it would just
  duplicate the (often large) result already JSON-stringified into the text channel, and
  read shapes still evolve — risky since clients (e.g. ChatGPT) validate against a
  ~1-day-stale cached `tools/list` schema.
- `get_page` / `get_block` now return an explicit `{ found: false }` on a miss
  (instead of an empty object that read as a successful empty page/block).
- Hardened `delete_block` / `delete_page` descriptions: deletion is irreversible and
  removes all descendants, and for `delete_block` deleting a referenced block
  replaces those references elsewhere with the block's text (and comments count as
  backrefs); steer inspect-first via `get_block` + `get_backlinks`.
- Graph identity is now carried as a structured `graph` field (canonical graph name),
  injected into `structuredContent` + the JSON text body, instead of a `"Roam graph: …"`
  text prefix (which read as block content and made a read's JSON non-parseable).
- Fixed `GetBlockResponse.path` type (`string` → `string[]`).
- Raised the `@modelcontextprotocol/sdk` floor to `>=1.26.0 <2.0.0`.

## 0.6.6 - 2026-06-01

- Added MCP tool **annotations** (`readOnlyHint` / `destructiveHint` /
  `idempotentHint` / `openWorldHint`) + human titles to every tool, sourced in core
  and forwarded by the local and hosted MCP servers. Fixes ChatGPT silently dropping
  write tool calls (its safety layer blocks tools that lack these hints).
- Renamed the local MCP server identity to `roam-mcp-local`.

## 0.6.5 - 2026-05-26

- Published all four workspace packages together for the first time:
  `@roam-research/roam-tools-core`, `@roam-research/roam-tools-local`,
  `@roam-research/roam-mcp`, and `@roam-research/roam-cli`.
- Published `@roam-research/roam-tools-local` as the local Roam Desktop transport
  package used internally by MCP and CLI.
- Updated `roam-mcp` and `roam-cli` from their prior public `0.5.1` line to the
  new split-package architecture, each with exact `local@0.6.5` sibling pins.
- Verified the local MCP/CLI path after the package split: build, typecheck, lint,
  core/local tests, MCP `tools/list`, CLI `list-graphs`, `get-graph-guidelines`,
  and `search`.
- Neutralized references to private hosted-MCP infrastructure in public docs and
  source comments.

## 0.6.4 - 2026-05-23

- Core-only release.
- Reworded the shared `graph` parameter description.
- Rewrote the `get_graph_guidelines` nudge appended to client tool descriptions.
- Expanded the `get_graph_guidelines` tool description to encourage agents to
  fetch graph-specific guidance more reliably.

## 0.6.3 - 2026-05-20

- Core-only release.
- Trimmed the orientation note appended to client tool descriptions to a quieter,
  transport-neutral one-liner.
- Added MCP server instructions in the unpublished workspace package to steer
  clients through `list_graphs` and `get_graph_guidelines`.

## 0.6.2 - 2026-05-13

- Core-only release.
- Widened `RoamError.code` to accept arbitrary backend-emitted strings while
  preserving autocomplete for known `ErrorCodes` values.
- Removed local-client casts that bypassed the stricter error-code type.
- Updated remote-MCP integration notes around the transport-agnostic contract.

## 0.6.1 - 2026-05-09

- Core-only release.
- Added cloud-transport-oriented error code constants:
  `MISSING_AUTH`, `INSUFFICIENT_PERMISSION`, `NOT_IMPLEMENTED`,
  `GRAPH_UNSUPPORTED`, `ACTION_NOT_AVAILABLE`, and `PEER_NOT_READY`.

## 0.6.0 - 2026-04-25

- Core-only release.
- Split the package architecture into transport-agnostic core plus a local Roam
  Desktop transport in the workspace.
- Made core's routing path accept injected graph resolution and client creation,
  enabling hosted transports to depend on core without local Desktop code.

## Historical Core-Only Release Window

From `0.6.0` through `0.6.4`, only `@roam-research/roam-tools-core` was published
from the split-package work. During that window, published `roam-mcp` and
`roam-cli` versions remained on `0.5.1`, with exact dependency pins that prevented
them from accidentally picking up `core@0.6.x`.

| Package           | Versions on npm                                                                          | Dependency behavior                                                |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `roam-mcp`        | `0.3.1`, `0.3.2`                                                                         | Pre-split, all-in-one                                              |
| `roam-mcp`        | `0.4.0` to `0.5.1`                                                                       | Exact one-to-one `core` pin matching the MCP package version       |
| `roam-cli`        | `0.4.0` to `0.5.1`                                                                       | Exact one-to-one `core` pin matching the CLI package version       |
| `roam-tools-core` | `0.4.0`, `0.4.1`, `0.4.2`, `0.5.0`, `0.5.1`, `0.6.0`, `0.6.1`, `0.6.2`, `0.6.3`, `0.6.4` | Terminal package; hosted transports could install `0.6.x` directly |
