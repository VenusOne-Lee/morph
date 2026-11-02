# How Morph keeps data safe

Morph adds reports and actions to your app without adding a new way into your data. Everything it reads or changes goes through the same row level security (RLS) policies your app already relies on.

## The viewer is the only identity

| Path | Runs as | Key |
| --- | --- | --- |
| `<MorphReport>`, `<MorphDashboard>` | The signed-in user, through your supabase-js client | anon / publishable |
| `morph mcp` | The user who ran `morph mcp login` | anon / publishable plus their refresh token |
| `morph init`, `scan` | A read-only database role you choose | none (connection string, never saved) |

Morph never uses a service-role or secret key. The CLI, the MCP server and `doctor` refuse to run with one, and CI fails if one shows up in the source.

## What the migration adds

- **Report views** named `morph_r_<report>`, created `with (security_invoker = true)`, so they run with the viewer's rights and your policies apply row by row. Granted to `authenticated` only; revoked from `anon` and `public`.
- **Three functions**: `morph_preview_action`, `morph_apply_action`, `morph_undo`. They are `SECURITY INVOKER` with `search_path = ''`, so an UPDATE only succeeds where your UPDATE policy allows it. Table and column names come from `morph__action_def()`, a constant allow-list baked into the migration, and are quoted with `%I`. Nothing from the request becomes an identifier.
- **`morph_audit`**, one row per applied action, with the before and after of every field. Clients can't insert or edit audit rows: the insert policy only passes inside `morph_apply_action`, and only the undo columns can be updated, only inside `morph_undo`.

## Guard rails in the data

- **RLS off means blocked.** A table with RLS off can't be a report source. `scan` warns about it; `doctor` fails on it.
- **RLS on with no policies** shows nothing to anyone, which is what Postgres does. Morph says so instead of showing an empty report.
- **PII off by default.** Columns that look like emails, phone numbers or ID numbers are marked `pii: true, exposed: false`. Unexposed fields never reach a view, the MCP server or an AI prompt.
- **Bulk limits.** One action changes at most 25 rows by default (200 hard cap).
- **Concurrency.** The preview records each row's version. Apply fails if anyone changed a row since, and the viewer gets a fresh preview.
- **Undo is careful.** It restores every field, but stops if a row changed since and names who changed it. "Undo the rest" is an explicit second step.

## Threat model

| Threat | What stops it |
| --- | --- |
| A viewer reads rows they shouldn't | `security_invoker` views; your SELECT policies |
| A viewer changes rows they shouldn't | `SECURITY INVOKER` functions; your UPDATE policies, checked in the dry run and again on apply |
| SQL injection through action payloads | Identifiers come only from the baked allow-list; values are parameters |
| Forged or edited audit history | Insert and update policies keyed to a transaction-local flag only Morph's functions set |
| A leaked key bypasses RLS | Morph refuses service-role and secret keys everywhere |
| An agent applies a change nobody saw | `apply_action` needs a `preview_id` from the last 10 minutes; MCP clients see it as destructive |
| Personal data leaks into reports or prompts | PII fields start unexposed |

Found a gap? Please tell us privately: see [SECURITY.md](../SECURITY.md).
