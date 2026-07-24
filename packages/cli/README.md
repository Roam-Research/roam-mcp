# @roam-research/roam-cli

The official command-line interface for [Roam Research](https://roamresearch.com/).

Used for setup (connecting graphs, managing tokens) and direct tool access (search, get pages, create blocks, etc.) — the same Roam tools [`@roam-research/roam-mcp`](https://www.npmjs.com/package/@roam-research/roam-mcp) exposes to AI assistants like Claude.

> **Alpha Software**: This project is in early development and subject to breaking changes.

> [!CAUTION]
> **Full Write Access**: The CLI can create, modify, and delete pages and blocks in your Roam graph. **Changes may be difficult or impossible to undo.** Roam does not have a traditional undo history that can reverse bulk operations or deletions made through the API.
>
> **Recommendations:**
>
> - Back up your graph before use
> - Start with a test graph
> - Be specific in your commands to avoid unintended changes

## Prerequisites

- **Node.js** v18 or later
- **Roam Research desktop app** (the local API is not available in the web version)

## Install

```bash
npm install -g @roam-research/roam-cli
```

## Setup

```bash
roam connect
```

This walks you through selecting a graph, choosing permissions, and approving the token in the Roam desktop app.

**Non-interactive** (for scripts and LLM agents):

```bash
roam connect --graph my-graph-name --nickname "My Team Graph" --access-level full
```

| Flag                     | Default                 | Description                                  |
| ------------------------ | ----------------------- | -------------------------------------------- |
| `--graph <name>`         | —                       | Graph name (enables non-interactive mode)    |
| `--nickname <name>`      | Required with `--graph` | Short name you'll use to refer to this graph |
| `--access-level <level>` | `full`                  | `full`, `read-append`, or `read-only`        |
| `--public`               | —                       | Public graph (read-only, hosted)             |
| `--type <type>`          | `hosted`                | `hosted` or `offline`                        |

`--access-level` asks Roam for a permission tier; Roam decides what to actually grant and the result is recorded in `~/.roam-tools.json`. The CLI does not enforce it — editing that value by hand does not change what an agent can do.

To remove a connection:

```bash
roam connect --remove --graph my-graph-name
```

## Usage

```bash
roam list-graphs
roam connect                                                    # Interactive setup
roam connect --graph <name> --nickname <name>                   # Non-interactive
roam search --query "my notes" --graph <name-or-nickname>
roam get-page --title "My Page" --graph <name-or-nickname>
```

If you only have one graph configured, the `--graph` flag is optional.

Run `roam --help` to see all available commands.

## Multiple Graphs

Run `connect` multiple times to add additional graphs. Each graph gets a nickname (a short name like "work" or "team acme") for easy selection.

- **Single graph configured**: Auto-selected, no action needed
- **Multiple graphs configured**: Pass `--graph <name-or-nickname>` on each command

## Available Tools

All tools are available as CLI commands. Run `roam <command> --help` for details on any command.

**Graph Management:**

- `list-graphs` - List all configured graphs with their nicknames
- `setup-new-graph` - Set up a new graph connection, or list available graphs

**Graph Guidelines:**

- `get-graph-guidelines` - Returns user-defined instructions and preferences for AI agents

Graph guidelines let you store preferences and context directly in your Roam graph that AI agents will follow. Create a page called `[[roam/agent guidelines]]` with your instructions.

**Content:**

- `create-page` - Create page with markdown content
- `update-page` - Update page title or children view type
- `delete-page` - Delete a page
- `create-block` - Create blocks (by parent UID, page title, or daily note date — MM-DD-YYYY or `today`/`yesterday`/`tomorrow`; with optional nest-under)
- `append-to-daily-note` - Append/capture markdown to a daily note (today by default, or MM-DD-YYYY / `today`/`yesterday`/`tomorrow`; optional nest-under section)
- `update-block` - Update block content/properties
- `move-block` - Move a block to a new location
- `delete-block` - Delete a block
- `add-comment` - Add a comment to a block (comment thread, not child block)
- `get-comments` - Get comments on a block with author/date context

**Read:**

- `search` - Search pages/blocks (empty query returns recently edited/viewed content)
- `semantic-search` - Semantic (embeddings) search by meaning; requires embeddings enabled and a signed-in user
- `suggest-links` - Suggest existing pages worth linking to from a passage of text (does not create links)
- `search-templates` - Search Roam templates by name
- `roam-query` - Execute a Roam query (`{{query:}}` blocks, not Datalog)
- `datalog-query` - Execute a raw Datalog query against the graph's Datomic database
- `get-page` - Get page content as markdown
- `get-block` - Get block content as markdown
- `get-backlinks` - Get references to a page/block

**Navigation:**

- `get-open-windows` - Main window view and all sidebar windows
- `get-selection` - Currently focused block and multi-selected blocks
- `open-main-window` - Navigate to page/block
- `open-sidebar` - Open in right sidebar

**Shortcuts:**

- `add-shortcut` - Add a page to the left sidebar Shortcuts / starred pages (optional `--index` to position it)
- `remove-shortcut` - Remove a page from the left sidebar Shortcuts / starred pages

**Files:**

- `file-get` - Fetch a file hosted on Roam (handles decryption for encrypted graphs)
- `file-upload` - Upload a file to Roam (from local path, URL, or base64)
- `file-delete` - Delete a file hosted on Roam

**Developer:**

- `reload-dev-extensions` - Reload all developer-mode extensions in Roam Desktop (apply code changes without restarting)
- `call-extension-tool` - Invoke an AI tool registered by a Roam extension or roam/js script (discover available tools via the `extensionTools` field of `get-graph-guidelines`; pass tool arguments as JSON, e.g. `--args '{"key": "value"}'`)

## Hiding content from the AI

Blocks tagged `#.rm-hide` or `#.rm-private` — and everything nested under them — are omitted from the content these commands return. The read commands that surface graph content to the AI (`get-page`, `get-block`, `get-backlinks`, `search`, `semantic-search`, `search-templates`, `roam-query`) all skip hidden subtrees. Both the hashtag (`#.rm-hide`) and link (`[[.rm-hide]]`) forms work; `.rm-private` is Roam's existing "hidden from other users" tag, while `.rm-hide` hides from the AI specifically.

**This is a convenience filter, not a security guarantee.** The filtering is applied only to the AI content commands above. The raw `datalog-query` command reads the database directly and does **not** apply it, so a capable agent could still surface hidden blocks through datalog. Don't rely on these tags for anything truly sensitive — treat them as "keep it out of the AI's way," not "keep it secret."

## Updating

To update to the latest version:

```bash
npm install -g @roam-research/roam-cli
```

Check your current version with `roam --version`.

## Using with npx

If you prefer not to install globally, you can use npx:

```bash
npx @roam-research/roam-cli connect
npx @roam-research/roam-cli search --query "my notes"
```

## Documentation

See the [main repository](https://github.com/Roam-Research/roam-tools) for development setup, contributing guidelines, and architecture details.
