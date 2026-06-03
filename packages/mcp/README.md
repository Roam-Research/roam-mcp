# @roam-research/roam-mcp

The official [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for [Roam Research](https://roamresearch.com/).

Connect Claude, Cursor, and other AI assistants to your Roam graph for reading, writing, and searching.

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

## Setup

### 1. Connect a graph

```bash
npx @roam-research/roam-mcp connect
```

This walks you through selecting a graph, choosing permissions, and approving the token in the Roam desktop app.

**Non-interactive** (for scripts and LLM agents):

```bash
npx @roam-research/roam-mcp connect --graph my-graph-name --nickname "My Team Graph" --access-level full
```

| Flag                     | Default                 | Description                                  |
| ------------------------ | ----------------------- | -------------------------------------------- |
| `--graph <name>`         | —                       | Graph name (enables non-interactive mode)    |
| `--nickname <name>`      | Required with `--graph` | Short name you'll use to refer to this graph |
| `--access-level <level>` | `full`                  | `full`, `read-append`, or `read-only`        |
| `--public`               | —                       | Public graph (read-only, hosted)             |
| `--type <type>`          | `hosted`                | `hosted` or `offline`                        |

To remove a connection:

```bash
npx @roam-research/roam-mcp connect --remove --graph my-graph-name
```

### 2. Add to your MCP client

**Claude Desktop** — add to your config file:

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

**Claude Code:**

```bash
claude mcp add -s user roam-mcp -- npx -y @roam-research/roam-mcp
```

This makes Roam available in all your Claude Code sessions. To add it to a single project only, use `-s local` instead.

## Multiple Graphs

Run `connect` multiple times to add additional graphs. Each graph gets a nickname (a short name like "work" or "team acme") for easy selection.

- **Single graph configured**: Auto-selected, no action needed
- **Multiple graphs configured**: Pass the `graph` parameter on each tool call with the nickname

## Available Tools

**Graph Management:**

- `list_graphs` - List all configured graphs with their nicknames
- `setup_new_graph` - Set up a new graph connection, or list available graphs

**Graph Guidelines:**

- `get_graph_guidelines` - Returns user-defined instructions and preferences for AI agents

Graph guidelines let you store preferences and context directly in your Roam graph that AI agents will follow. Create a page called `[[roam/agent guidelines]]` with your instructions.

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

**Files:**

- `file_get` - Fetch a file hosted on Roam (handles decryption for encrypted graphs)
- `file_upload` - Upload a file to Roam (from local path, URL, or base64)
- `file_delete` - Delete a file hosted on Roam

## Updating

When using `npx`, you always get the latest version. To force a refresh if npx caches a stale version:

```bash
npx clear-npx-cache
```

## Documentation

See the [main repository](https://github.com/Roam-Research/roam-tools) for development setup, contributing guidelines, and architecture details.
