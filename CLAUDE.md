# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build        # Compile TypeScript (tsc --build, builds core → local → mcp + cli)
npm run clean        # Remove build artifacts (dist/ and tsbuildinfo)
npm run typecheck    # Type-check (force rebuild, checks all packages)
npm run lint         # Lint with ESLint
npm run lint:fix     # Lint and auto-fix
npm run format       # Format with Prettier
npm run format:check # Check formatting without writing
npm run mcp          # Run MCP server in dev mode (tsx with development condition)
npm run mcp -- connect              # Interactive setup for graph tokens (via MCP binary)
npm run cli -- <command> [options]  # Run CLI in dev mode
npm run cli -- connect              # Interactive setup for graph tokens (via CLI)
npm run cli -- connect --graph <name> --nickname <name>  # Non-interactive setup (for scripts/agents)
npm test --workspace @roam-research/roam-tools-core   # Run core's vitest suite
npm test --workspace @roam-research/roam-tools-local  # Run local's vitest suite
```

## Version Bumps

The version must be updated in 9 places across four packages. Use the automated script:

```bash
npm run version:bump 0.6.1    # Updates all 9 locations at once
npm install                    # Sync package-lock.json
```

The 9 locations:

1. `packages/core/package.json` — `"version"` field
2. `packages/local/package.json` — `"version"` field
3. `packages/local/package.json` — `@roam-research/roam-tools-core` dependency version
4. `packages/mcp/package.json` — `"version"` field
5. `packages/mcp/package.json` — `@roam-research/roam-tools-local` dependency version
6. `packages/cli/package.json` — `"version"` field
7. `packages/cli/package.json` — `@roam-research/roam-tools-local` dependency version
8. `packages/mcp/src/index.ts` — `McpServer` constructor `version` string
9. `packages/cli/src/index.ts` — Commander `.version()` call

Run `npm run version:check` to verify all versions are consistent.

## Release Notes

Release history lives in [`CHANGELOG.md`](CHANGELOG.md). Keep `CLAUDE.md` focused
on operational guidance for agents and maintainers.

All four workspace packages release in lockstep via `npm run publish:all`:

- `@roam-research/roam-tools-core`
- `@roam-research/roam-tools-local`
- `@roam-research/roam-mcp`
- `@roam-research/roam-cli`

**Lockstep is the default, not an invariant.** `core` is also consumed directly by
the hosted MCP (a separate, private repo), so it is sometimes published _alone_ to
get a change to that consumer without cutting a local release — `core@0.7.5` and
`core@0.8.0` both shipped this way, while `local`/`mcp`/`cli` stayed at `0.7.4`.
This is safe for end users because `bump-version.mjs` writes **exact** sibling
pins: `roam-mcp@0.7.4 → roam-tools-local@0.7.4 → roam-tools-core@0.7.4` resolves as
a coherent tree no matter what newer `core` versions exist on npm.

**`publish:all` is not idempotent.** It is an `&&` chain with `core` first, so if
`core@X` is already on the registry, `npm publish -w packages/core` returns E403 and
the chain dies _before_ `local`/`mcp`/`cli` are reached — the script cannot be used
to let the others catch up. To reconcile after a solo `core` publish, either bump all
four to the next patch (preferred: `publish:all` then runs clean end-to-end) or
publish `local` → `mcp` → `cli` individually, in that order, since `mcp` and `cli`
pin `local` exactly and it must land first.

**Maintainer obligation:** the `bump-version.mjs` script writes exact sibling
dependency strings (no semver ranges). Do not change this — lockstep publishing
depends on it. If a future PR introduces caret/tilde dep ranges between
workspace packages, published packages could silently mix untested sibling
versions.

### Code vocabulary (post-0.6.2)

`docs/architecture.md` is the current authoritative source for the `ErrorCodes` framing. Short version:

- **Since `core@0.6.2`**: `RoamError.code` accepts arbitrary strings (`ErrorCode | (string & {})`), not just the enum members. The `(string & {})` branded-string intersection preserves IDE autocomplete on known `ErrorCodes.X` literals while accepting any string at runtime.
- **`ErrorCodes` is a recommended vocabulary, not a contract**. It exists for IDE autocomplete, cross-package consistency, and the local-transport `case` matches in `RoamClient.handleApiError`. New codes can be added by PR (optional, not required).
- **For the cloud transport**: codes emitted by the hosted backend pass through verbatim — the hosted transport's backend is the source of truth for cloud-emitted codes. A new backend-side code reaches the agent's JSON envelope without any TS-side coordination.
- **For the local transport**: `RoamClient` in `packages/local/src/client.ts` keeps using `ErrorCodes.X` constants for its own emissions (`VERSION_MISMATCH`, `UNKNOWN_ACTION`, `INTERNAL_ERROR`, `CONNECTION_FAILED`) and for the 401/403 paths where Electron's code is passed through directly (the `as any` casts that bypassed the strict type were removed in `0.6.2`).
- **Two TS-only consumer call sites** still narrow on specific codes: `packages/mcp/src/index.ts:104` (`error.code === ErrorCodes.CONFIG_TOO_NEW`) and `packages/cli/src/index.ts:153` (`error.code === ErrorCodes.GRAPH_NOT_SELECTED`). Both continue to work after widening — TypeScript preserves runtime equality and literal narrowing.

## Architecture

> **See also [`docs/architecture.md`](docs/architecture.md)** — the transport-agnostic contract external consumers (including the hosted MCP) depend on, the cross-transport discrepancies, and the rules for changing this repo without breaking the remote MCP.

This is a monorepo with four npm packages for Roam Research tools:

| Package                           | Bin        | Purpose                                                               |
| --------------------------------- | ---------- | --------------------------------------------------------------------- |
| `@roam-research/roam-tools-core`  | none       | Transport-agnostic core: types, schemas, tool registry, dispatch      |
| `@roam-research/roam-tools-local` | none       | Local Roam Desktop API transport (RoamClient, config reader, connect) |
| `@roam-research/roam-mcp`         | `roam-mcp` | MCP server (consumes local)                                           |
| `@roam-research/roam-cli`         | `roam`     | CLI (consumes local)                                                  |

The split exists so a hosted MCP transport (in a separate, private repo) can depend on `roam-tools-core` directly and inject its own graph resolver + authenticated client without dragging the local-Desktop-API code along.

### Entry Points

- `packages/mcp/src/index.ts` - MCP server using stdio transport. Also handles `roam-mcp connect` subcommand (detects `process.argv[2] === "connect"` and dynamically imports the connect module from `@roam-research/roam-tools-local/connect`).
- `packages/cli/src/index.ts` - CLI using Commander.js. Dynamically generates commands from the same tool definitions.
- `packages/local/src/connect.ts` - Setup command for token exchange with Roam, shared by both MCP and CLI. Has two modes: interactive (no flags, uses inquirer prompts) and non-interactive (`--graph` flag, uses CLI options). Exposed as a separate export entry point (`@roam-research/roam-tools-local/connect`) to avoid loading `@inquirer/prompts` during normal MCP server operation.

### Core Layer (`packages/core/src/`)

Transport-agnostic. Knows nothing about local files, ports, or Roam Desktop. Hosted consumers can depend on this package alone.

- `index.ts` - Barrel export. Exposes types, schemas, tool registry, helpers, and `routeToolCall`. Does NOT export `RoamClient`, the `~/.roam-tools.json` reader, or `connect` — those live in `roam-tools-local`.

- `tools.ts` - Central tool registry. After the split, core only registers **client tools** (require a graph + RoamActionClient). Standalone tools (`list_graphs`, `setup_new_graph`) live in `roam-tools-local` since they touch local config and the Desktop API. Exports:
  - `dataTools` (graph content — reusable across local + hosted MCP)
  - `desktopUiTools` (file ops, window/selection — local Desktop only)
  - `contentTools = [...dataTools, ...desktopUiTools]` for back-compat
  - `tools = [...dataTools, ...desktopUiTools]` (alias of contentTools at this layer)
  - `findTool`, `routeToolCall` (REQUIRES `resolveGraph` + `createClient` in options)
  - `defineTool`, `defineStandaloneTool` (helpers for downstream consumers)

- `types.ts` - TypeScript types, Zod schemas for config validation, error codes and `RoamError` class. Notably defines:
  - `RoamActionClient` — structural client interface (`call()` + optional `getTokenInfo()`); both `RoamClient` (in local) and a hosted client (out-of-repo) satisfy it.
  - `ToolGraph` — cross-transport graph identity (`name, type, nickname, optional accessLevel + token`).
  - `ResolvedGraph extends ToolGraph` — adds required `token` and the local-only `lastKnownTokenStatus`.

### Local Layer (`packages/local/src/`)

Wraps core with the Roam Desktop transport.

- `index.ts` - Barrel export. Re-exports core's full surface (so MCP and CLI need only one import) and adds local-only symbols. Notably **shadows** core's `tools`, `findTool`, and `routeToolCall` with versions that include the local standalone tools and bake in defaults.

- `connect.ts` - Graph connection/setup logic. Exported separately as `@roam-research/roam-tools-local/connect` (not part of the main barrel) to isolate the `@inquirer/prompts` dependency.

- `tools.ts` - Local-defaults wrapper. Exports:
  - `graphManagementTools` (the two standalone tools: `list_graphs`, `setup_new_graph`)
  - `tools` (combined: graphManagementTools + core's tools)
  - `findTool` (searches the combined tools array)
  - `defaultResolveGraph` (delegates to `resolveGraph`)
  - `defaultCreateClient` (constructs `RoamClient` from `graph.token` + `getPort()`)
  - `routeToolCall` wrapper that fills in those defaults, defaults `tokenInfoMode` to `"local-sync"`, and dispatches local standalone tools directly (since core no longer knows about them)

- `client.ts` - `RoamClient` class for authenticated HTTP calls to Roam's local API. Requires token and graph type.

- `graph-resolver.ts` - Loads config from `~/.roam-tools.json`, resolves graphs by nickname or name (stateless, no session state).

- `roam-api.ts` - Shared API functions (fetch available graphs, request tokens, helpers) used by both `connect` and the `setup_new_graph` tool.

- `types.ts` - `RoamClientConfig` (constructor config for the local `RoamClient`).

### Operations

Core operations in `packages/core/src/operations/` are organized by domain:

- `pages.ts` - Create, get, update, delete pages; get graph guidelines
- `blocks.ts` - Create, get, update, delete, move blocks; get backlinks; comments
- `search.ts` - Text search and template search
- `query.ts` - Execute Roam queries
- `datalog.ts` - Raw datalog queries
- `navigation.ts` - Window management (main window, sidebar)
- `files.ts` - File upload, download, delete

Local-only operations in `packages/local/src/operations/`:

- `graphs.ts` - Graph management (list, setup new graph)

### Configuration

**`~/.roam-tools.json`** - Required config file with graph tokens (read by `roam-tools-local`):

```json
{
  "version": 1,
  "graphs": [
    {
      "name": "actual-graph-name",
      "type": "hosted",
      "token": "roam-graph-local-token-...",
      "nickname": "my-graph",
      "accessLevel": "full"
    }
  ]
}
```

Config versioning: `CONFIG_VERSION` in `core/types.ts` defines the current version. If a client reads a config with a higher version number, it throws `CONFIG_TOO_NEW` before Zod validation (in case the schema changed).

**`~/.roam-local-api.json`** - Written by Roam, provides port (default: 3333)

### Key Patterns

- **Transport-agnostic dispatch**: `core/routeToolCall(name, args, options)` requires `options.resolveGraph` and `options.createClient`. Local consumers go through `local/routeToolCall(name, args)` which fills those in. Hosted consumers (out-of-repo) supply their own.
- All client tools get an optional `graph` parameter via `withGraph()` helper (in `core/tools.ts`)
- Standalone tools (`list_graphs`, `setup_new_graph`) don't use withGraph and live in `local/tools.ts`
- **Output schemas are write-only**: the 9 write tools declare an `outputSchema` and emit `structuredContent`; the 9 read tools are content-only. `textResult` attaches `structuredContent` for any plain object, and `stripUndeclaredStructuredContent(result, tool)` (in `core/tools.ts`, applied by each transport's registration handler) drops it for schema-less tools — so `structuredContent` exists **iff** the tool declares a schema. Don't add read schemas (a schema just doubles the read payload — `textResult` already serializes the whole result into the text channel — and read shapes still evolve). Keep write-schema changes **additive**: clients like ChatGPT validate live responses against a ~1-day-stale cached `tools/list` schema, so a non-additive change to a declared field can break a tool for ~a day (use a new tool name or expand-contract). The full "why" lives in the presets comment block in `core/tools.ts`.
- Zod schemas drive both validation and CLI option generation
- `RoamError` class carries error codes and context for structured error responses
- API versioning: `EXPECTED_API_VERSION` in `core/types.ts` is sent as `expectedApiVersion` in every request body (`local/client.ts`). Roam checks that major.minor match exactly — **patch is ignored**. So `1.1.0` and `1.1.2` are compatible, but `1.1.x` and `1.2.x` are not. On mismatch, `handleVersionMismatch()` in `local/client.ts` compares server vs expected versions and throws a `RoamError` with advice on which side to update. This is completely independent of the npm package version (`0.x.y`).
- Config I/O (`~/.roam-tools.json`): No in-memory cache — config is read fresh from disk on every tool call. Write functions (`saveGraphToConfig`, `removeGraphFromConfig`, `updateGraphTokenStatus` — all in `local/graph-resolver.ts`) read the file at the last moment, apply the change, and write immediately. Invalid config errors are returned to the agent as `RoamError` (no `process.exit`), so the agent can tell the user what's wrong.
- `tokenInfoMode`: core's default is `"skip"` (transport-agnostic — local concerns are opt-in). Local's wrapper passes `"local-sync"` explicitly to preserve the desktop token-info side flow on `get_graph_guidelines`.
- Development mode: `npm run mcp` / `npm run cli` run `tsx --tsconfig ./tsconfig.dev.json …`. That dev-only config's `paths` map the workspace package names (`@roam-research/roam-tools-{core,local}`, plus `roam-tools-local/connect`) to their `src/*.ts`, so the whole monorepo runs live from TypeScript source with no build first. **Why a dev tsconfig and not an `exports` `development` condition:** the same `package.json` is what gets published, and a published `development → ./src/*.ts` condition breaks any downstream consumer whose resolver enables it (Vite/Vitest, Next dev/Turbopack) because `files` ships only `dist/`. Keeping source-resolution in `tsconfig.dev.json` (never published) means published `exports` point only at `dist/`. See GitHub issue #30. Do NOT re-add a `development` condition to any package's `exports`.
- README maintenance: The package READMEs (`packages/mcp/README.md`, `packages/cli/README.md`) are self-contained docs that npm users see first — often the only docs they read. When adding tools, changing setup steps, or modifying behavior, update these READMEs alongside the root `README.md`. The MCP README uses underscore tool names (`list_graphs`), the CLI README uses hyphenated command names (`list-graphs`).

### Workspace Structure

```
packages/
  core/     → @roam-research/roam-tools-core   (transport-agnostic library; what hosted MCP imports)
  local/    → @roam-research/roam-tools-local  (local Desktop transport; depends on core)
  mcp/      → @roam-research/roam-mcp          (MCP server; depends on local)
  cli/      → @roam-research/roam-cli          (CLI; depends on local)
scripts/
  bump-version.mjs   → Updates all 9 version locations
  check-versions.mjs → Verifies version consistency
```

Build order is enforced via TypeScript project references (`tsconfig.build.json` references core → local → mcp + cli).

### Authentication Flow

1. Tool called → `routeToolCall()` checks tool type
2. For client tools: `options.resolveGraph()` finds graph config (local default reads `~/.roam-tools.json` by nickname/name)
3. `options.createClient(graph)` constructs the transport (local default builds a `RoamClient`)
4. HTTP POST to `http://127.0.0.1:{port}/api/{graph}?type=offline` (if offline)
5. Request includes `Authorization: Bearer {token}` header
6. If connection refused: open `roam://#/app/{graph}` deep link, retry with backoff

### Graph Resolution Priority (local resolver)

Resolution is stateless — every tool call resolves the graph independently:

1. Explicit `graph` parameter on tool call
2. Auto-select if exactly one graph configured
3. Error with available_graphs if multiple graphs and no `graph` param
