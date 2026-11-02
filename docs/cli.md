# CLI

```bash
npx morph-reports <command> [options]
```

| Command | |
| --- | --- |
| `init` | Scan (read-only) and write `morph/` plus one migration. Shows a checklist of suggested reports. |
| `scan` | Re-scan, show what changed (new tables, removed fields), keep your choices, mark broken reports. |
| `diff` | Like `scan`, but writes nothing. |
| `migrate` | Regenerate the migration from `morph/` (`--stdout` to print it). Run after editing specs or actions. |
| `doctor` | Check the migration is applied, views and functions exist, RLS is on, model and database agree, and no service-role key is in your env files. Each failure prints its fix. |
| `mcp` | Start the MCP server. `mcp login`, `mcp status`, `mcp logout`. |

| Option | |
| --- | --- |
| `--url <conn>` | Connection string, or `MORPH_DATABASE_URL`. Never saved. |
| `--schema a,b` | Schemas to scan (default `public`). |
| `-y, --yes` | Accept the suggested reports, no prompts. |
| `--dry-run` | Write nothing. |
| `--allow-superuser` | Allow a role that bypasses RLS. Only needed to sample values on RLS tables; otherwise the scan works from names, constraints and enums. |

Exit codes: `0` ok, `1` user error, `2` connection error, `3` unsafe config (for example a service-role key).

## Naming

The npm name `morph` and the `@morph` scope are taken, so the CLI is published as `morph-reports` (command `morph`) and the libraries under `@morph-reports/*`. The product name stays Morph while domain checks finish.
