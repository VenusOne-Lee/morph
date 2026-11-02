# Morph

**Reports your customers can act on, with undo.**

Morph is an open source reporting and actions layer for apps built on Supabase (often with Lovable). One command scans your database and writes working reports. Drop one component into your app and your users can see what's stuck and fix it: every change shows a preview first and can be undone for 30 days.

Everything runs as the signed-in user, through your own row level security policies. Morph never uses a service-role key.

```
npx morph-reports init        # scan (read-only), write morph/ and one migration
supabase db push              # apply the migration
```

```tsx
import { MorphProvider, MorphDashboard } from '@morph-reports/react';
import model from '../morph/model.json';
import actions from '../morph/actions.json';
const reports = Object.values(import.meta.glob('../morph/reports/*.json', { eager: true, import: 'default' }));

<MorphProvider supabase={supabase} model={model} reports={reports} actions={actions}>
  <MorphDashboard title="Sales" />
</MorphProvider>
```

## What you get

| | |
| --- | --- |
| **Auto reports** | Pipeline by stage, stuck items, owner workload, trend, idle items, aging heatmap, top related, new per week. Picked from your schema, not a template. |
| **Act in place** | Kanban, owner balancer, stuck queue and "KPI with a fix" widgets. Move a deal or reassign it right from the report. |
| **Preview, then undo** | Every action shows the rows, the before and after, the impact on the report and the checks it passed. One transaction. Undo for 30 days. |
| **Safe by default** | Runs as the viewer under RLS. Tables with RLS off are blocked. Personal data columns stay off until you turn them on. |
| **Agents too** | `npx morph-reports mcp` exposes the same reports and actions to Claude and other MCP clients, as a signed-in user, with preview before apply. |

## How it works

```
your Postgres ──scan (read-only)──▶ morph/model.json, reports/*.json, actions.json
                                     │
                                     ▼
                          one migration (security_invoker views,
                          preview/apply/undo functions, morph_audit)
                                     │
   your app ── supabase-js as the viewer ──▶ <MorphReport/> <MorphDashboard/>
   your agent ─ MCP as a signed-in user ───▶ list_reports, run_report, preview_action, apply_action, undo
```

Reports are JSON specs you can read and edit. There is no hand-written SQL to maintain: `morph scan` keeps the specs in step with your schema and `morph migrate` regenerates the migration.

## Packages

| Package | |
| --- | --- |
| [`morph-reports`](packages/cli) | The CLI: `init`, `scan`, `diff`, `migrate`, `doctor`, `mcp` |
| [`@morph-reports/react`](packages/react) | `MorphProvider`, `MorphReport`, `MorphDashboard`, `MorphAuditLog`, widgets |
| [`@morph-reports/mcp`](packages/mcp) | MCP server (stdio) |
| [`@morph-reports/spec`](packages/spec) | Spec types, JSON Schema, validator, compiler |
| [`@morph-reports/sql`](packages/sql) | Migration generator |

## Docs

- [Quickstart](docs/quickstart.md): Lovable, Vite, Next.js
- [How Morph keeps data safe](docs/security.md)
- [Report spec reference](docs/spec.md)
- [Actions and undo](docs/actions.md)
- [Components and theming](docs/components.md)
- [MCP server](docs/mcp.md)
- [CLI](docs/cli.md)

## Status

v0.1, in a pilot with ten builders. The spec format is `v0` and may change with a migration note. See [CONTRIBUTING.md](CONTRIBUTING.md) to help, and [SECURITY.md](SECURITY.md) to report a problem privately.

Licensed under [Apache 2.0](LICENSE).
