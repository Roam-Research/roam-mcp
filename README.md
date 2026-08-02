# Roam MCP and CLI

The official [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server and CLI for [Roam Research](https://roamresearch.com/). Connect Claude, Cursor, and other AI assistants to your Roam graph — read, write, search, and query.

> **Alpha Software**: This project is in early development and subject to breaking changes.

> [!CAUTION]
> **Full Write Access**: This MCP server gives Claude full read and write access to your Roam graph. Claude can create, modify, and delete pages and blocks. **Changes may be difficult or impossible to undo.** Roam does not have a traditional undo history that can reverse bulk operations or deletions made through the API.
>
> **Recommendations:**
>
> - Back up your graph before use
> - Start with a test graph to understand Claude's behavior
> - Review what Claude plans to do before confirming write operations
> - Be specific in your instructions to avoid unintended changes

## Prerequisites

- **Node.js** v18 or later
- **Roam Research desktop app** (the local API is not available in the web version)

## How It Works

This MCP server connects to Roam's local HTTP API, which runs on your machine when the desktop app is open. If Roam isn't running when a tool is called, the server will automatically launch it via deep link and retry the connection.

## Getting Started

### 1. Roam Desktop App

The local API requires the Roam **desktop app** (not the web version). Make sure it's installed and you can open your graph in it.

### 2. Connect a Graph

**Interactive** (recommended for first-time setup):

```bash
npx @roam-research/roam-mcp connect
```

This will walk you through selecting a graph, choosing permissions, and approving the token in Roam. You can also use the CLI: install globally with `npm install -g @roam-research/roam-cli`, then use `roam connect`.

**Non-interactive** (for scripts and LLM agents):

```bash
# example to connect to your graph called "my-graph-name" which you generally refer to as "My Team Graph"
npx @roam-research/roam-mcp connect --graph my-graph-name --nickname "My Team Graph" --access-level full

# example to connect to a public graph - our "help" graph
npx @roam-research/roam-mcp connect --graph help --public --nickname "Roam official help graph"
```

| Flag                     | Default                 | Description                                  |
| ------------------------ | ----------------------- | -------------------------------------------- |
| `--graph <name>`         | —                       | Graph name (enables non-interactive mode)    |
| `--nickname <name>`      | Required with `--graph` | Short name you'll use to refer to this graph |
| `--access-level <level>` | `full`                  | `full`, `read-append`, or `read-only`        |
| `--public`               | —                       | Public graph (read-only, hosted)             |
| `--type <type>`          | `hosted`                | `hosted` or `offline`                        |

**Note:** Both modes require a human to approve the token dialog in the Roam desktop app.

To remove a connection:

```bash
npx @roam-research/roam-mcp connect --remove --graph my-graph-name
npx @roam-research/roam-mcp connect --remove --nickname "My Team Graph"
```

Run `connect` again to add more graphs or update permissions.

### 3. Connect to an MCP Client

**Claude Desktop**

Add to your Claude Desktop config file:

```json
{
  "mcpServers": {
    "roam": {
      "command": "npx",
      "args": ["-y", "@roam-research/roam-mcp"]
    }
  }
}
```

Config file location:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Restart Claude Desktop after saving.

**Claude Code**

```bash
claude mcp add -s user roam-mcp -- npx -y @roam-research/roam-mcp
```

This makes Roam available in all your Claude Code sessions. To add it to a single project only, use `-s local` instead.

### Multiple Graphs

Run `connect` multiple times to add additional graphs. Each graph gets a nickname (a short name like "work" or "team acme") for easy selection.

**Graph Selection:**

- **Single graph configured**: Auto-selected, no action needed
- **Multiple graphs configured**: Pass the `graph` parameter on each tool call with the nickname

### Manual Configuration (Advanced)

Instead of using `connect`, you can manually create `~/.roam-tools.json`:

```json
{
  "version": 1,
  "graphs": [
    {
      "name": "your-graph-name",
      "type": "hosted",
      "token": "roam-graph-local-token-...",
      "nickname": "my-graph"
    }
  ]
}
```

To create a token manually: Roam Desktop → Settings → Graph → Local API Tokens → New Token.

| Field         | Required | Description                                                       |
| ------------- | -------- | ----------------------------------------------------------------- |
| `name`        | Yes      | The actual graph name in Roam (as shown in the URL)               |
| `type`        | No       | `"hosted"` (default) for cloud graphs, `"offline"` for local-only |
| `token`       | Yes      | Local API token from Roam settings                                |
| `nickname`    | Yes      | Slug identifier for this graph (lowercase, hyphens, no spaces)    |
| `accessLevel` | No       | `"full"` (default), `"read-only"`, or `"read-append"`             |

`accessLevel` records what the token was granted; it is not enforced by the CLI or MCP server — Roam enforces the token's real permissions. Setting it by hand does not change what an agent can do. (A fourth value, `"read-edit-own"`, is accepted by the config schema, and whatever level Roam grants is written to your config verbatim. Roam's local API does not currently grant that tier, so you are unlikely to see it in a locally-created token.)

## Available Tools

**Graph Management:**

- `list_graphs` - List all configured graphs with their nicknames
- `setup_new_graph` - Set up a new graph connection, or list available graphs

**Graph Guidelines:**

- `get_graph_guidelines` - Returns user-defined instructions and preferences for AI agents

Graph guidelines let you store preferences and context directly in your Roam graph that AI agents will follow. Create a page called `[[roam/agent guidelines]]` with your instructions. These might include naming conventions, preferred page structures, topics to focus on, or any other context that should guide how the AI interacts with your graph.

**Content:**

- `create_page` - Create page with markdown content
- `update_page` - Update page title or children view type
- `delete_page` - Delete a page
- `create_block` - Create blocks (by parent UID, page title, or daily note date — MM-DD-YYYY or `today`/`yesterday`/`tomorrow`; with optional nest-under)
- `append_to_daily_note` - Append/capture markdown to a daily note (today by default, or MM-DD-YYYY / `today`/`yesterday`/`tomorrow`; optional nest-under section)
- `update_block` - Update block content/properties
- `move_block` - Move a block to a new location
- `delete_block` - Delete a block
- `add_comment` - Add a comment to a block (comment thread, not child block)
- `get_comments` - Get comments on a block with author/date context

**Read:**

- `search` - Search pages/blocks (empty query returns recently edited/viewed content)
- `semantic_search` - Semantic (embeddings) search by meaning; requires embeddings enabled and a signed-in user
- `suggest_links` - Suggest existing pages worth linking to from a passage of text (does not create links)
- `search_templates` - Search Roam templates by name
- `roam_query` - Execute a Roam query (`{{query:}}` blocks, not Datalog)
- `datalog_query` - Execute a raw Datalog query against the graph's Datomic database
- `get_page` - Get page content as markdown
- `get_block` - Get block content as markdown
- `get_backlinks` - Get references to a page/block

**Navigation:**

- `get_open_windows` - Main window view and all sidebar windows
- `get_selection` - Currently focused block and multi-selected blocks
- `open_main_window` - Navigate to page/block
- `open_sidebar` - Open in right sidebar

**Shortcuts:**

- `add_shortcut` - Add a page to the left sidebar Shortcuts / starred pages (optional `index` to position it)
- `remove_shortcut` - Remove a page from the left sidebar Shortcuts / starred pages

**Files:**

- `file_get` - Fetch a file hosted on Roam (handles decryption for encrypted graphs)
- `file_upload` - Upload a file to Roam (from local path, URL, or base64)
- `file_delete` - Delete a file hosted on Roam

**Developer:**

- `reload_dev_extensions` - Reload all developer-mode extensions in Roam Desktop (apply code changes without restarting)
- `call_extension_tool` - Invoke an AI tool registered by a Roam extension or roam/js script (discover available tools via the `extensionTools` field of `get_graph_guidelines`)

## Hiding content from the AI

Blocks tagged `#.rm-hide` or `#.rm-private` — and everything nested under them — are omitted from the content these tools return. The read tools that surface graph content to the AI (`get_page`, `get_block`, `get_backlinks`, `search`, `semantic_search`, `roam_query`) all skip hidden subtrees. (`search_templates` is the exception: template previews are NOT filtered, so hidden blocks inside a shared template can appear in its results.) Both the hashtag (`#.rm-hide`) and link (`[[.rm-hide]]`) forms work; `.rm-private` is Roam's existing "hidden from other users" tag, while `.rm-hide` hides from the AI specifically.

**This is a convenience filter, not a security guarantee.** The filtering is applied only to the AI content tools above. The raw `datalog_query` tool reads the database directly and does **not** apply it, so a capable agent could still surface hidden blocks through datalog. Don't rely on these tags for anything truly sensitive — treat them as "keep it out of the AI's way," not "keep it secret."

## Agent skill: `roam-syntax`

The [`skills/roam-syntax/`](skills/roam-syntax/) directory contains an [Agent Skill](https://agentskills.io) that teaches AI agents Roam's syntax and the MCP read/write model: Roam-flavored markdown (it differs from standard markdown — e.g. italics are `__text__`), how to read the `<roam .../>`-tagged output the read tools return, and how to write content back without corrupting block references. Agents connected through this MCP server get a compact version of the same guidance automatically (the `roamSyntax` field of `get_graph_guidelines` plus the tool descriptions); the skill adds depth — full syntax, `{{...}}` components, queries, and worked read→edit→write examples — for agent platforms that support skills (Claude Code, Claude.ai, Codex, …). To use it, copy `skills/roam-syntax/` into your agent's skills directory (e.g. `.claude/skills/`).

## CLI

Install globally for quick access:

```bash
npm install -g @roam-research/roam-cli
```

```bash
roam list-graphs
roam connect                                                    # Interactive setup
roam connect --graph <name> --nickname <name>                   # Non-interactive
roam search --query "my notes" --graph <name-or-nickname>
roam get-page --title "My Page" --graph <name-or-nickname>
```

If you only have one graph configured, the `--graph` flag is optional.

Run `roam --help` to see all available commands. You can also use `npx @roam-research/roam-cli` without installing globally.

## Packages

This repository is a monorepo with four packages:

| Package                                             | Description                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`@roam-research/roam-tools-core`](packages/core)   | Transport-agnostic core library (tools, operations, types, dispatch)                               |
| [`@roam-research/roam-tools-local`](packages/local) | Local Roam Desktop transport (client, config reader, connect) — internal dependency of MCP and CLI |
| [`@roam-research/roam-mcp`](packages/mcp)           | MCP server — connect Claude/Cursor/etc. to Roam                                                    |
| [`@roam-research/roam-cli`](packages/cli)           | CLI — setup and direct tool access                                                                 |

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Development

To work on this project from source:

```bash
git clone https://github.com/Roam-Research/roam-tools.git
cd roam-tools
npm install
npm run build
```

Development commands:

```bash
npm run mcp              # Run MCP server in dev mode (tsx)
npm run cli -- connect   # Run CLI in dev mode
npm run typecheck        # Type-check (force rebuild, checks all packages)
npm run lint             # Lint with ESLint
npm run format:check     # Check formatting with Prettier
npm run version:check    # Verify all package versions are consistent
npm run version:bump 0.5.0  # Bump all packages to a new version
```

See [architecture](docs/architecture.md) for how the four packages divide responsibility and the core contract external consumers depend on, and [npm packaging design](docs/npm-packaging-design.md) for why the packages are structured this way.

## Contributing

This project is changing rapidly. At this time, we prefer suggestions and feedback over pull requests. Please open an issue or join the #ai-in-roam channel on slack to discuss ideas before submitting code.
