# Changelog

## Unreleased

- `get_graph_guidelines` now returns a `roamSyntax` field: a compact,
  graph-agnostic guide to writing structured Roam (links, nesting, attributes,
  queries, components, and where to find more) so agents write correctly before
  their first edit. Independent of the user's `[[roam/agent guidelines]]` page.

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
