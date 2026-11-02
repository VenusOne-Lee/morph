# Contributing to Morph

Thanks for helping. Morph is small on purpose, so the bar for new surface area is high and the bar for fixes is low.

## Set up

You need Node 20+, pnpm 10 and Postgres 16 (Docker is easiest).

```bash
pnpm install
docker compose up -d          # Postgres on port 54329
pnpm fixtures:up              # creates the crm, helpdesk, lovable-starter and messy databases
pnpm build && pnpm test && pnpm test:integration
```

No Docker? Point `MORPH_FIXTURES_URL` at any Postgres 16 superuser connection.

## Layout

| Package | What it does |
| --- | --- |
| `packages/spec` | Types, validation, the report compiler and aggregation. No I/O. |
| `packages/sql` | Generates the one migration: report views, preview/apply/undo functions, `morph_audit`. |
| `packages/cli` | `morph init`, `scan`, `doctor`, `migrate`, `mcp`. Published as `morph-reports`. |
| `packages/react` | `MorphProvider`, `MorphReport`, `MorphDashboard`, action widgets. |
| `packages/mcp` | The MCP server. |
| `packages/testkit` | Fixture databases and a client that runs as a fixture user the way PostgREST does. |
| `fixtures/` | Four sample apps with RLS policies, seeds and their generated `morph/` folders. |

## Rules for every change

1. Never use a service-role key, in code, tests or docs. CI fails if one appears.
2. Specs, never SQL. Reports are JSON specs; the only SQL is what `packages/sql` generates.
3. PII stays off by default.
4. Tables with RLS off stay blocked.
5. Test against the fixtures as a real user (`db.as('rep')`), not as a superuser.
6. Copy is calm and plain. Every string a user sees lives in a `locales/en.json`.
7. Add a changeset (`pnpm changeset`) when a published package changes.

## Good first issues

Look for the `good first issue` label. New widget types, locale files and fixture apps are great places to start.
