# Architecture & the remote-MCP contract

> **Audience:** anyone (human or agent) modifying this repo. Read this before changing anything in `packages/core`.
> **Why it exists:** `@roam-research/roam-tools-core` is consumed not only by the local packages in this repo but by a **separate, private hosted MCP server** that pins core over npm. That hosted consumer is not in this tree, so it's easy to break it without noticing. This doc explains how the packages divide responsibility, where the transports differ, and the rules that keep a core change from silently breaking the hosted MCP.
> **Scope:** this is an inward-facing architecture doc. It deliberately describes only **core's public contract** and treats the hosted server abstractly — none of the hosted server's backend internals live here. For version-bump mechanics, see `CLAUDE.md`; for release history, see `CHANGELOG.md`.

---

## 1. The four packages

```
packages/
  core/   → @roam-research/roam-tools-core    transport-agnostic library
  local/  → @roam-research/roam-tools-local    local Roam Desktop transport (depends on core)
  mcp/    → @roam-research/roam-mcp     (bin: roam-mcp)   MCP server (depends on local)
  cli/    → @roam-research/roam-cli      (bin: roam)      CLI (depends on local)
```

Dependency chain: **`core → local → {mcp, cli}`** (enforced by TypeScript project references).

| Package       | Knows about                                                                                                | Must NOT know about                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `core`        | types, Zod schemas, the tool registry, operation functions, the `routeToolCall` dispatcher                 | local files, ports, the Roam Desktop API, `~/.roam-tools.json`, `@inquirer/prompts`, `fs` |
| `local`       | the Roam Desktop transport: `RoamClient`, `~/.roam-tools.json` reader, `connect`, the two standalone tools | —                                                                                         |
| `mcp` / `cli` | wiring `local` to a transport (stdio MCP / Commander)                                                      | core directly (they import from `local`)                                                  |

**Why the split exists:** so a hosted MCP server (a separate, private repo) can depend on `core` **alone** and inject its own graph resolver + its own authenticated client, without dragging in any of the local-Desktop code. Everything below follows from that goal.

**Lean-dependency invariant:** `core` depends only on `@modelcontextprotocol/sdk` + `zod` (no `fs`, `@inquirer/prompts`, or `open`) and runs on Node 18+. A hosted consumer bundles `core`, so a stray local-only dependency would leak into its bundle — keeping this dep set lean is part of the split (see the §6 rule against importing local-only deps into core).

---

## 2. The transport-agnostic contract (`core`'s public surface)

This is the seam external consumers depend on. Treat every symbol the hosted consumer imports as a **published contract** — changing it can break a consumer you can't see. Defined in `packages/core/src/{types,tools,index}.ts`; re-exported from `packages/core/src/index.ts`.

The sections below name the load-bearing exports; **`packages/core/src/index.ts` is the authoritative full list** (it also exports the `CallToolResult` builders `textResult` / `imageResult` / `errorResult`, `getErrorMessage`, and `GraphConfigSchema` / `RoamMcpConfigSchema`). The hosted consumer's installed-package smoke tests also import `EXPECTED_API_VERSION`, `desktopUiTools`, and `defineStandaloneTool`, even though runtime registration uses `dataTools` only. Per §6, removing or renaming **any** barrel export is a breaking change.

### 2a. The dispatcher

```ts
function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options: RouteToolCallOptions, // required — no default
): Promise<CallToolResult>;

interface RouteToolCallOptions {
  resolveGraph: (providedGraph?: string) => Promise<ToolGraph>;            // REQUIRED
  createClient: (graph: ToolGraph) => Promise<RoamActionClient> | RoamActionClient; // REQUIRED
  tokenInfoMode?: "local-sync" | "skip";                                   // default "skip"
  onTokenStatusUpdate?: (nickname: string, patch: {...}) => Promise<void>; // only used in local-sync
}
```

What it does, in order (`packages/core/src/tools.ts`): find the tool → **reject standalone tools** (throws; core only routes `client` tools) → validate `args` against the tool's Zod schema → strip the `graph` field out of args → `resolveGraph(graphArg)` → `createClient(graph)` → (only for `get_graph_guidelines` **and** `tokenInfoMode === "local-sync"` **and** `client.getTokenInfo` present: run the token-info side flow) → otherwise `tool.action(client, restArgs)` → on success, `withGraphField` → wrap any thrown `RoamError` into the structured error result.

### 2b. The interfaces a consumer implements / receives

```ts
interface RoamActionClient {
  call<T = unknown>(action: string, args?: unknown[]): Promise<RoamResponse<T>>;
  getTokenInfo?(): Promise<TokenInfoResult>; // optional; only the local transport implements it
}

interface ToolGraph {
  name: string; // canonical graph name (the transport uses this to address the graph)
  type: GraphType; // "hosted" | "offline"
  nickname: string; // local-sync token-status update key (since 0.8.0 the result's `graph` field echoes the caller's `graph` arg — nickname or name — or the canonical name when none was passed)
  accessLevel?: AccessLevel; // "read-only" | "read-append" | "read-edit-own" | "full"
  token?: string; // local-only; a hosted resolver omits it
}

interface ResolvedGraph extends ToolGraph {
  token: string;
  lastKnownTokenStatus?: "active" | "revoked";
}

class RoamError extends Error {
  constructor(message: string, code?: ErrorCode | (string & {}), context?: Record<string, unknown>);
}
```

`RoamResponse<T>` (`{ success, result?, error?, apiVersion?, expectedApiVersion? }`) is what `call()` returns; `RoamApiError` is `{ message, code? }`.

### 2c. `ErrorCodes` — a recommended vocabulary, not a hard contract

`ErrorCodes` (26 members today) exists for IDE autocomplete and cross-package consistency. Since the `RoamError.code` type is `ErrorCode | (string & {})`, **any string is a valid code at runtime** — a transport may emit codes core has never heard of. Two consequences:

- Core must **never validate** an incoming code against the `ErrorCodes` enum.
- **Adding** a member is additive/safe; **removing or renaming** one is a breaking change (TS consumers narrow on the literals — e.g. `mcp` on `CONFIG_TOO_NEW`, `cli` on `GRAPH_NOT_SELECTED`).

### 2d. The tool registry

| Export                                           | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataTools`                                      | 18 graph-content tools — **transport-neutral** (they only call `client.call(...)`). This is what a hosted consumer registers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `desktopUiTools`                                 | 13 tools the hosted MCP omits. Seven assume a local Desktop / filesystem (`get_open_windows`, `get_selection`, `open_main_window`, `open_sidebar`, `file_get`, `file_upload`, `file_delete`). Four are renderer-only Local API actions with no hosted-backend counterpart (`semantic_search`, `suggest_links`, `reload_dev_extensions`, `call_extension_tool` — the last invokes AI tools extensions register in the running app, which the hosted backend's peer replica has no channel to). `add_shortcut` / `remove_shortcut` are graph-data tools (transport-neutral `client.call`) parked here to stay **local-only** until the hosted backend is confirmed to expose `data.page.addShortcut`/`removeShortcut` — then move them to `dataTools`. |
| `contentTools` / `tools`                         | `[...dataTools, ...desktopUiTools]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `findTool`, `defineTool`, `defineStandaloneTool` | registry helpers. `defineTool` runs `withGraph` to add the optional `graph` param to every client tool.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

A tool definition may also carry an optional `outputSchema` (declared on the 9 write tools only — see §2e for the `structuredContent` contract).

`withGraph`'s `graph` param description is intentionally transport-neutral: _"Graph to act on, by nickname or name. Optional — if only one graph is available, it is used automatically."_ — it must not assume local-only concepts.

### 2e. Constants & result behavior

- `EXPECTED_API_VERSION` (`"1.1.5"`) — sent on every backend call; the backend compares **major.minor** exactly (patch ignored). Consumers read it from core, never hardcode.
- `CONFIG_VERSION` (`1`).
- **Output schemas & `structuredContent` (write-only).** Tool definitions carry an optional `outputSchema` (a Zod object), declared on the **9 write tools only** — the 9 reads are content-only. `textResult(value)` attaches `value` as `structuredContent` for any plain object; `stripUndeclaredStructuredContent(result, tool)` drops it again when the tool has **no** `outputSchema`. The wire invariant is therefore **`structuredContent` is present iff the tool declares an `outputSchema`** — and **every transport must apply the strip-gate** (the SDK validates `structuredContent` against the schema on success and throws if a schema-bearing tool returns none). Schemas are `.passthrough()` + all-optional; keep changes to a _declared_ write field **additive** (clients such as ChatGPT validate live responses against a ~1-day-stale cached `tools/list` schema, so a non-additive change can break a tool for ~a day — use a new tool name or expand-contract). Reads are deliberately schema-less: a schema would double the payload (`textResult` already serializes the whole result into the text channel) and read shapes still evolve.
- `withGraphField` carries the resolved graph identity as a structured `graph` field — injected into `structuredContent` (write tools) and into the result's JSON text body when it parses as an object (content-only reads) — instead of a `"Roam graph: …"` text prefix. **Since 0.8.0** the value is the identifier the caller passed in the `graph` arg (echoed; nickname or name), falling back to the canonical graph name when no `graph` arg was passed; it still overwrites any `graph` key the backend returned, so a backend cannot spoof it. (Before 0.8.0 it was always the canonical name.) `GUIDELINES_NOTE` is appended to client-tool descriptions to nudge `get_graph_guidelines`.

### 2f. Client conventions & the error envelope

Any `RoamActionClient` implementation must follow two conventions, because the operation functions and the dispatcher assume them:

- **`call()` contract.** On success, return `{ success: true, result }` — operation functions read `result` and build the `CallToolResult`. On failure, **throw `RoamError(message, code?, context?)` — never return `{ success: false }`.** (The `{ success: false }` shape is the Roam-API wire envelope, not the JS-throwable convention core's operations expect.)
- **Error envelope.** When core catches a thrown `RoamError`, it produces:

  ```jsonc
  {
    "content": [
      { "type": "text", "text": "{ \"error\": { \"code\": ..., \"message\": ..., ...context } }" },
    ],
    "isError": true,
  }
  ```

  The `RoamError`'s `context` keys are **spread into** the `error` object (e.g. `available_graphs`, `request_id`), so the agent sees them. A `RoamError` thrown anywhere in an operation or a client surfaces this way.

---

## 3. How `local` specializes `core`

`packages/local/src/index.ts` re-exports core's surface **but shadows** `tools`, `findTool`, and `routeToolCall` with local versions (it deliberately does **not** re-export those three from core). The local `routeToolCall` wrapper (`packages/local/src/tools.ts`):

1. Dispatches the two **standalone** tools — `list_graphs`, `setup_new_graph` (`graphManagementTools`) — directly, since core doesn't know about them.
2. Delegates client tools to core's `routeToolCall`, filling in local defaults: `defaultResolveGraph` (reads `~/.roam-tools.json`), `defaultCreateClient` (builds a `RoamClient` from `graph.token` + the discovered port), `tokenInfoMode: "local-sync"`, and `onTokenStatusUpdate: updateGraphTokenStatus`.

`RoamClient` (`packages/local/src/client.ts`) implements `RoamActionClient` **and** `getTokenInfo` (which is why the local-sync side flow fires for it). `mcp` sets a server `instructions` field steering clients through `list_graphs` → `get_graph_guidelines`, and exits on `CONFIG_TOO_NEW`; `cli` prints available graphs on `GRAPH_NOT_SELECTED`.

---

## 4. How a hosted transport consumes `core`

The hosted MCP server lives in a separate, private repo and is **not** in this tree. From core's perspective it is just another consumer of the §2 contract. At a high level it:

- Imports `dataTools`, `routeToolCall`, `RoamError`, `ErrorCodes`, and the `RoamActionClient` / `ToolGraph` types from `core` (and, from `0.6.7`, `stripUndeclaredStructuredContent`). Its installed-package tests also guard `EXPECTED_API_VERSION`, `desktopUiTools`, and `defineStandaloneTool`.
- Registers **`dataTools` only** (omits `desktopUiTools` — remote contexts have no local window/filesystem).
- **Forwards each tool's `outputSchema` and applies the strip-gate** (see §2e). It passes `outputSchema: tool.outputSchema` into its `registerTool` config, and after `routeToolCall` returns it drops `structuredContent` for any tool with no `outputSchema` — via the shared `stripUndeclaredStructuredContent` helper (from `0.6.7`; a hand-rolled inline check before then) — so the "`structuredContent` iff `outputSchema`" invariant is identical to the local transport. Its own standalone tools (e.g. `list_graphs`) may declare their own `outputSchema` + emit `structuredContent` directly.
- Injects its **own** `resolveGraph` (backed by its own grant store, not `~/.roam-tools.json`) and its **own** client (its own auth, not a local token).
- Passes `tokenInfoMode: "skip"` and does **not** implement `getTokenInfo` — so the `get_graph_guidelines` side flow never fires.
- Authors its **own** `list_graphs` / `setup_new_graph` standalone tools and registers them directly with the MCP SDK. (They can't go through `routeToolCall`, which throws on standalone tools.)
- Pins core with a **caret range** on a chosen minor (`^0.7.0` → `^0.8.0` historically). Each widening is a deliberate opt-in on their side.

That caret is the crux of §6: anything we ship in a **patch of the pinned minor** reaches the hosted server automatically. A new minor does not — it waits until they widen the range.

> **Current gap (as of core `0.10.0`).** The hosted consumer still pins **`^0.8.0`** (resolving `0.8.0`), so it has **none** of `0.9.x`/`0.10.x` — including `ROAM_SYNTAX` / `ROAM_SYNTAX_APPEND_ONLY` and the newer tools. On 0.x a caret does **not** cross minors, which is exactly why `0.10.0` was released as a minor: the new-format syntax guidance cannot reach hosted agents by accident. The widening to `^0.10.0` is deliberately sequenced **after** the hosted backend deploys the matching wire format — until then, guidance describing that format would not match what the backend emits.

---

## 5. Cross-transport discrepancies

Real, intentional differences. Keep them in mind when reasoning about behavior or writing copy.

| Aspect                      | Local (`roam-tools-local`)             | Hosted (separate repo)                      | Core's stance                                                                                                                                                                                                                                                  |
| --------------------------- | -------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **nickname**                | **Required** (kebab-case schema field) | **Optional** (falls back to the graph name) | local-sync passes it to `onTokenStatusUpdate` (token-status key); hosted resolvers set it to the graph name when absent. Since 0.8.0 the result's `graph` field echoes the caller's `graph` arg (nickname or name), or the canonical name when none was passed |
| **`graph` param**           | accepts nickname **or** name           | accepts nickname **or** name                | the param is the same string either way                                                                                                                                                                                                                        |
| **resolution lookup order** | nickname → name                        | name → nickname                             | core doesn't resolve; the injected `resolveGraph` does                                                                                                                                                                                                         |
| **`tokenInfoMode` default** | `"local-sync"` (local wrapper sets it) | `"skip"`                                    | core's own default is `"skip"`                                                                                                                                                                                                                                 |
| **`getTokenInfo`**          | implemented (`RoamClient`)             | not implemented                             | optional on the interface                                                                                                                                                                                                                                      |
| **standalone tools**        | `graphManagementTools` (2)             | authors its own                             | core has none                                                                                                                                                                                                                                                  |
| **error codes**             | emits a subset of `ErrorCodes`         | passes its backend's codes through verbatim | `RoamError.code` accepts arbitrary strings since 0.6.2                                                                                                                                                                                                         |

---

## 6. How to change this repo without breaking the remote MCP

**The load-bearing fact:** the hosted consumer pins core with a **caret** on a chosen minor (today `^0.8.0`, while core is published at `0.10.0` — see the gap note in §4). So **any patch we publish within the pinned minor reaches it automatically, with no review on their side** — every later `0.8.x` would land there unreviewed. A minor bump does not reach it until they widen the range. SemVer discipline on `core` is therefore a safety mechanism, not a formality: the minor boundary is what let `0.10.0`'s guidance wait for the hosted deploy instead of arriving unannounced.

### What each bump level is allowed to contain

- **Patch (`0.6.x`)** — behavior-preserving only: docs, tests, type-only changes, and **copy** (tool/param descriptions). By explicit exception (decided for `0.9.2`), a patch **may also add a local-only tool to `desktopUiTools`**: the hosted transport omits that array entirely, so such an addition cannot reach the hosted consumer through a caret-range patch upgrade — which is the safety rationale this rule protects.
  - ⚠️ Tool and parameter **descriptions are part of `dataTools`** and ship straight to the hosted agent. So "just copy" still reaches a different transport — keep it **transport-neutral** (no local-isms like "configured"; prefer "available"). The recent neutralizing of the `graph` param description is the model here.
- **Minor (`0.7.0`)** — additive only: new exports; new tools that are **transport-safe**; new **optional** `RouteToolCallOptions` fields with safe defaults. A new local-only tool must go in `desktopUiTools` (which the hosted side omits) or stay a standalone in `local` — never in `dataTools`.
  - **A new `dataTools` tool must be wired in every transport that serves it**, not just published here. Core only exposes the schema, description, and `client.call("data.X.Y", ...)` operation; each transport still needs its own action handler. The local Desktop API must expose the action through Roam's local API, and the hosted MCP backend must expose the same action through its hosted dispatcher. If either side is missing, that transport fails independently (for example, hosted may return `ACTION_NOT_AVAILABLE`). Publishing the tool in `core` alone is not enough. When adding a `dataTools` tool, ask a human operator to check the main private Roam codebase for the corresponding local-API and hosted-dispatcher wiring before release.
- **Major (`1.0.0`)** — anything that changes or removes existing behavior (see the checklist).

### Don't-break checklist (a change needs a minor or major bump if it does any of these)

- Adds a **required** field to `RouteToolCallOptions`, or changes `resolveGraph` / `createClient` signatures, or changes the dispatch contract (rejecting standalones, stripping `graph`, `withGraphField`).
- Removes or renames a core barrel export: `dataTools`, `desktopUiTools`, `routeToolCall`, `defineStandaloneTool`, `RoamError`, `ErrorCodes`, `RoamActionClient`, `ToolGraph`, `EXPECTED_API_VERSION`, the result/type helpers.
- Changes the shape of `ToolGraph`, `RoamActionClient`, `RoamResponse`, `RoamApiError`, or `RoamError`.
- Removes or renames an `ErrorCodes` member (adding one is safe). Also: never validate a code against the enum — the hosted transport emits codes core doesn't know.
- Adds a tool to `dataTools` that assumes local-only capabilities (filesystem / Desktop UI). It would reach the hosted agent and fail.
- Tightens a `dataTool`'s Zod schema in a patch — renaming/removing an arg, or flipping optional → required. Hosted agents call these schemas.
- Makes `withGraph`'s `graph` param required, or re-bakes a local assumption into its description.
- Imports a local-only dependency (`fs`, `@inquirer/prompts`, `RoamClient`, the config reader) into `core` — this defeats the whole split and would break the hosted bundle.
- Changes `EXPECTED_API_VERSION`'s major.minor — that's a real wire-compatibility change with the backend, not a cosmetic bump.
- Introduces a caret/tilde dep range in `mcp`'s or `cli`'s `package.json` for a sibling `@roam-research/*` package — `bump-version.mjs` writes **exact** pins on purpose (see the exact sibling-pin invariant in `CLAUDE.md`).

### Before shipping a `core` change

1. `npm run typecheck && npm run lint && npm run build` and both workspace test suites.
2. Classify the change as patch / minor / major using the rules above. If it's beyond a patch, the hosted consumer should not pick it up silently — coordinate before publishing.

---

## 7. Relationship to `CLAUDE.md`

`CLAUDE.md` owns the **version-bump mechanics** (the 9 locations, `bump-version.mjs` / `check-versions.mjs`) and the exact sibling-pin invariant. `CHANGELOG.md` owns release history. This doc owns the **contract** and the **don't-break rules**. When they touch the same idea (exact pins, SemVer), this doc points at `CLAUDE.md` rather than restating it.

---

## 8. Open questions (feedback welcome)

1. **Internal infra references in committed core (resolved).** Core's source comments and the published package READMEs previously named the hosted backend's internal infrastructure; these have been neutralized to transport-agnostic descriptions so the open-source repo stays clean.
2. **No automated guard on the contract.** Nothing today stops a patch from breaking the caret-pinned hosted consumer. Worth adding a public-surface snapshot test (e.g. a checked-in `index.d.ts` snapshot, or an api-extractor report) that fails CI on an unintended surface change?
3. **Documented SemVer policy.** Should `core`'s README / `package.json` state the patch/minor/major policy from §6 explicitly, so _all_ consumers (not just the hosted one) know what a caret range buys them?
4. **Caret vs exact on the hosted side.** The hosted consumer pins a caret range, so patches land unreviewed. Keep the caret and rely on strict patch discipline, or ask the hosted side to pin exact and adopt deliberately?
5. **Terminology.** Is "the hosted MCP / hosted transport (a separate, private repo)" the right abstract label to use throughout, or do you have a preferred non-sensitive name?
6. **`EXPECTED_API_VERSION` coupling.** Anything this doc should say about whether/where the hosted path enforces the version field — without reaching into backend specifics?
