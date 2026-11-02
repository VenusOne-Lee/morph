# MCP server

The same reports and actions, for Claude and other MCP clients. The server runs as a signed-in user, so your RLS policies decide what an agent can see and change.

## Sign in

```bash
npx morph-reports mcp login --url https://<project>.supabase.co --anon-key <anon key> --email you@example.com
# or --magic-link to get a code by email instead of typing a password
```

The refresh token is saved to `~/.config/morph/session.json`, readable only by you. `mcp status` shows who you're signed in as; `mcp logout` removes it. A service-role or secret key is refused.

## Connect a client

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "morph": {
      "command": "npx",
      "args": ["-y", "morph-reports", "mcp"],
      "cwd": "/path/to/your/app"
    }
  }
}
```

Claude Code: `claude mcp add morph -- npx -y morph-reports mcp` from your app folder.

The server reads `morph/` from the folder it starts in.

## Tools

| Tool | Hint | What it does |
| --- | --- | --- |
| `list_reports` | read-only | Reports with their columns and allowed actions |
| `run_report` | read-only | Rows (50 by default, up to 500) and group totals, as the user |
| `preview_action` | read-only | The diff, the checks and a `preview_id`. Writes nothing. |
| `apply_action` | destructive | Applies exactly that preview, once, within 10 minutes. Audit `source = 'mcp'`. |
| `undo` | destructive | Puts every field back; `partial: true` to undo the untouched rows only |

Example summary from `preview_action`: "Preview: move 1 deal from Lead to Qualified. Nothing has been written."
