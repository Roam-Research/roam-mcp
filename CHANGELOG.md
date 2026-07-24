# Changelog

## 0.9.2 - 2026-07-23

- **New local-only tool: `call_extension_tool`** (`data.ai.callExtensionTool`) — invokes AI
  tools that Roam extensions and roam/js scripts register at runtime. Takes `tool` (the id
  exactly as advertised — opaque: qualified `<extension-id>/<name>` for extension-registered
  tools, bare `<name>` for roamAlphaAPI-registered ones; never parse or construct it) and
  optional `args` (a JSON object matching the tool's advertised `inputSchema`). Registered in
  `desktopUiTools`: the hosted backend serves from a peer replica with no channel to a live
  client, so this tool must never reach the hosted server. Annotations are worst-case
  (destructive, non-idempotent, open-world) since the tool runs arbitrary extension handler
  code.
- **All validation is renderer-side; errors pass through verbatim.** Roam meta-validates
  schemas at registration and validates the AI's `args` against the tool's `inputSchema`
  (draft-07) before the handler runs — roam-tools deliberately ships no validator, keeping
  the transport a dumb pipe. The three error classes (unknown tool — lists the currently
  available ids; args/schema mismatch — names the violations; handler failure) are written
  for model self-correction and surface untouched. One exception: an app build without the
  feature returns `UNKNOWN_ACTION`, which the tool maps to a friendly "update Roam Desktop"
  message — the API-version gate can't detect this case (see below).
- **`get_graph_guidelines` now surfaces `extensionTools`** — the local backend's listing of
  registered extension AI tools (`{tool, description, scope, extension?, inputSchema?}`),
  present only when non-empty and only on the local transport. When present, `nextSteps`
  points the agent at `call_extension_tool`. Content-only as before (no `outputSchema`).
- **CLI: JSON flags for non-flat tool params.** The generated commands now parse
  object/record/array-typed fields as JSON strings (`roam call-extension-tool --tool x
--args '{"key": "value"}'`), with a clear error on invalid JSON. This also fixes
  `datalog-query --inputs`, which previously passed the raw string through and always
  failed Zod validation.
- **`EXPECTED_API_VERSION` 1.1.3 → 1.1.5** — the extension-AI-tools feature shipped as Local
  API `1.1.5`, a patch revision. Roam's version gate matches major.minor exactly and ignores
  patch, so compatibility with older builds is unchanged — which also means the gate **cannot
  detect** a desktop build that predates the feature. Older builds return `UNKNOWN_ACTION`
  for `data.ai.callExtensionTool` (mapped to the friendly update message above) and simply
  omit `extensionTools` from guidelines.

## 0.9.1 - 2026-07-20

- **Two new local-only tools**, each surfacing an existing Roam Local API action. No
  API-version change: both actions already ship at `1.1.3`, which matches
  `EXPECTED_API_VERSION`, so this is purely a roam-tools-side addition.
  - **`suggest_links`** (`data.ai.suggestLinks`) — given a passage of `text`, suggests
    existing pages worth linking to, ranked most-plausible first. Suggestion-only: it
    does not create links. Optional `maxResults` (default 20).
  - **`reload_dev_extensions`** (`depot.reloadDeveloperExtensions`) — reloads all
    developer-mode extensions in Roam Desktop (the `C-d C-r` command), returning the
    reloaded `{id, name}` list.
- **Both are registered in `desktopUiTools`** (renderer-only Local API actions with no
  hosted-MCP counterpart yet, alongside `semantic_search`). MCP tool registration and CLI
  command generation are registry-driven, so they surface automatically as the
  `suggest_links` / `reload_dev_extensions` MCP tools and `suggest-links` /
  `reload-dev-extensions` CLI commands — no per-tool edits to `mcp`/`cli` were needed. Both
  are content-only (no `outputSchema`): the returned data is what the agent reads, which
  also sidesteps the ChatGPT stale-cache hazard write-schemas carry.
- **Runtime dependency to note:** `reload_dev_extensions` needs a Roam Desktop build from
  **2026-07-16** or later (the build that exposed `depot.reloadDeveloperExtensions` on
  `roamAlphaAPI`); older builds return `UNKNOWN_ACTION`. `suggest_links` needs a build from
  **2026-07-08** or later. This is independent of the npm package version.

## 0.9.0 - 2026-07-15

- **New local-only tool: `semantic_search`** (embeddings) — ranks pages and blocks by
  meaning, surfacing conceptually related content that keyword `search` misses. Opt-in: it
  requires the user to enable embeddings in Roam and be signed in, and returns an error
  telling the agent to fall back to `search` when the graph hasn't enabled it. Registered
  as a `desktopUiTool` (needs the renderer's search worker + embeddings index, which the
  hosted MCP backend has no counterpart for).
- **New local-only tools: `add_shortcut` / `remove_shortcut`** — add or remove a page in
  the graph's left-sidebar Shortcuts (the starred/pinned pages `get_graph_guidelines`
  reports as `starredPages`). `add_shortcut` takes an optional `index` to position it.
  Registered as `desktopUiTools` for now; promote to `dataTools` once the hosted backend
  confirms `data.page.addShortcut` / `removeShortcut`.
- **Fix: `file_upload` MIME detection for non-image files** (#21) — non-image uploads now
  resolve the correct content type.
- **Packaging fix: stop publishing the `development` export condition** that pointed at
  unshipped `src` (#30). A published `development → ./src/*.ts` condition broke any
  downstream consumer whose resolver enables it (Vite/Vitest, Next dev/Turbopack), because
  `files` ships only `dist/`. Source resolution now lives in the never-published
  `tsconfig.dev.json`. Do **not** re-add a `development` condition to any package's `exports`.
- **`EXPECTED_API_VERSION` 1.1.2 → 1.1.3** — a patch bump. Roam matches major.minor exactly
  and ignores patch, so this stays compatible with the same Roam builds `0.8.x` targeted;
  the bump just tracks a non-breaking Local API revision. (An intermediate `1.2.0` bump
  during development was walked back before release — the published `0.9.0` carries `1.1.3`.)
- **Docs:** documented `((uid))<ref>text</ref>` block-ref previews in the `get_page` /
  `get_block` tool descriptions, and the `#.rm-hide` / `#.rm-private` AI-content-hiding tags
  in the READMEs.

## 0.8.1 - 2026-07-09

_No runtime change: `core`'s `dist` is byte-identical to `core@0.8.0` once comments are stripped._

- **Publishes `local`, `mcp`, and `cli` at `0.8.1`.** `core` shipped `0.7.5` and `0.8.0`
  on its own (for the hosted MCP); the other three stayed at `0.7.4` and never carried
  those changes. Upgrading `roam-mcp` / `roam-cli` from `0.7.4` therefore picks up both
  the `0.7.5` `nextSteps` copy and the `0.8.0` `graph`-echo behavior at once. `core@0.8.1`
  is a comment-only republish so all four packages line up again. The hosted MCP pins
  `^0.8.0`, so `core@0.8.1` **does** reach it automatically and unreviewed — safe here
  because nothing but comments changed, but the usual patch discipline (`docs/architecture.md` §6)
  applies to every `0.8.x` from now on.
- **Neutralized internal infrastructure names in core's source comments** (`operations/pages.ts`,
  `types.ts`) and in this changelog, per `docs/architecture.md` §8.1. The `pages.ts` comment
  compiled into `dist/` and was therefore shipped inside the published `core@0.7.5`/`0.8.0`
  tarballs; `0.8.1` stops it shipping forward.
- **Docs & tests only, otherwise.** Corrected `withGraphField`'s docstring (it injects a
  field named `graph`, valued from its `graphLabel` argument — there is no `graphLabel`
  key on the wire); refreshed the stale `AccessLevel` and caret-range references in
  `docs/architecture.md`; recorded the `publish:all` non-idempotency in `CLAUDE.md`; and
  added tests pinning `read-edit-own` (schema + `validLevels` guard) and the echoed
  `graph` in a write tool's `structuredContent`.
- **Known gap, tracked in a `TODO(local transport)` at the echo site.** The `0.8.0` echo
  suits the hosted MCP but fits the local transport less well: `resolveGraph` auto-selects
  when exactly one graph is configured, so a caller that omits `graph` gets the canonical
  name back while a later call passing the nickname gets the nickname — one graph, two
  labels in one session. Write results also no longer carry the canonical graph they
  landed in. Likely fix is an additive canonical `graphName` alongside `graph`.

## 0.8.0 - 2026-06-19

_Minor bump (not a patch): this changes `withGraphField`'s observable output. Per
`docs/architecture.md` §6, a change to the injected `graph` field is a dispatch-contract
change and is not patch-eligible — the caret-pinned hosted MCP must opt into `^0.8.x`
deliberately rather than inherit it automatically._

- **The injected `graph` field now echoes the identifier the caller passed** (the
  nickname or name in the tool call's `graph` arg) instead of always the canonical
  resolved name. It falls back to the canonical name when no `graph` arg is passed
  (single-graph auto-select). This completes the `get_graph_guidelines`
  over-orientation fix from 0.7.5: ChatGPT looped because it called the tool by a
  nickname (e.g. "work graph"), but the result, which the "do NOT call again for this
  graph" directive points at, named only the canonical graph (e.g. "chatgpt-mcp-main"),
  so the agent could never tell it had already oriented the graph it knew by that
  nickname. Echoing the caller's own identifier lets it match. Applies to every tool
  and both transports (local and hosted). The value stays a string (no `outputSchema`
  change; write tools' optional `graph` field still validates) and still overwrites any
  backend-supplied `graph`, so it is not a spoof vector. No consumer reads the field
  programmatically; only the agent does.
- **`roam-cli` inherits this too**, since it dispatches through the same `routeToolCall`
  and prints the result body verbatim: `roam get-page --graph work` now reports
  `"graph": "work"` rather than the canonical graph name. Note that `0.8.0` was published
  for `core` only — the CLI and MCP server pick this change up in `0.8.1`.

## 0.7.5 - 2026-06-14

- **`get_graph_guidelines` `nextSteps` now leads with an explicit "stop orienting"
  directive**, to counter ChatGPT's over-orientation loop (observed re-calling
  `get_graph_guidelines` ~20× in one turn before doing the task, even on a fresh
  connector — so not a cache issue). `nextSteps` now opens with "You now have this
  graph's guidelines … Do NOT call get_graph_guidelines again for this graph this
  session" before the existing read-the-daily-note guidance, so an agent re-reading
  the result mid-loop sees the stop in the response body itself, not only in the
  tool description. Copy-only; no schema or behavior change, and it helps every
  client. (The hosted MCP's ChatGPT profile separately drops the "before your first
  read" trigger from its gentler instructions/description; this core change is the
  belt-and-suspenders.)

## 0.7.4 - 2026-06-13

- **Add `read-edit-own` to the `AccessLevel` type** (read + append + edit/delete only the agent's own
  content). Additive and runtime-safe: a new union member, with existing values and behavior unchanged,
  the local `connect` CLI's hardcoded level list untouched, and `accessLevel` still carried (not enforced)
  in core. Shipped as a patch so `^0.7.x` consumers (the caret-pinned hosted MCP) pick it up automatically.
  Also accepted by the `GraphConfigSchema` `accessLevel` enum and the `validLevels` token-info status
  check. The tier is enforced server-side in the remote/hosted MCP; the local Desktop API tier
  is deferred (the local API exposes the full `roamAlphaAPI` surface, not the hosted MCP's closed allowlist).

## 0.7.3 - 2026-06-13

- **Orientation copy: firm "applies to reads too", as the default — with a per-client escape
  hatch.** Live testing showed Claude (especially in tool-search mode) skipping
  `get_graph_guidelines` on reads — rationalizing them as exempt ("guidelines matter most for
  writes") — after 0.7.2 softened the copy to calm ChatGPT's over-orientation loop. ChatGPT and
  Claude want opposite copy, so the firm version is now the default and ChatGPT is the exception:
  - The `get_graph_guidelines` description and the per-tool `GUIDELINES_NOTE` nudge are firm and
    explicitly cover reads ("including simple reads / for reads"; the user's conventions change how
    to _interpret and present_ what you read, not just how you write). Dropped 0.7.1's "preferences,
    not commands" framing, which had downgraded guidelines to optional.
  - New export **`DEFAULT_MCP_INSTRUCTIONS`** — the shared server `instructions` orientation block,
    used by the stdio server and as the hosted server's default. The hosted (remote) server
    overrides it with a gentler variant for ChatGPT, which over-orients on the "even for reads"
    language. Descriptions/instructions only; no behavior change.

## 0.7.2 - 2026-06-13

- **`get_graph_guidelines` description reworked.** Replaced the 0.7.1 "hardening" sentence — which
  framed guidelines via the system/developer/user instruction hierarchy and, in practice, sent
  high-reasoning agents off on a "where's the developer message?" tangent — with a lighter hint:
  guidelines are the user's preferences for _how_ to carry out a request, guidance to respect, not
  commands that override what the user actually asked. Also dropped the "your work will likely need
  to be redone" pressure. Descriptions only; no behavior change.
- **Softened the server `instructions`.** The orientation block no longer says "do this even for
  simple reads / skipping risks violating your setup"; it now says to call `get_graph_guidelines`
  **once per graph, then proceed — don't call it again** for that graph. Counters an observed
  over-orientation loop (a high-reasoning client re-calling `get_graph_guidelines` dozens of times in
  one turn). Mirrored in the hosted MCP server.

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
