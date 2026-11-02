# Quickstart

Three steps on any Supabase app: scan, push the migration, add the component.

## 1. Scan

```bash
npx morph-reports init --url "postgresql://<read-only role>@<host>:5432/postgres"
```

The scan is read-only and the connection string is never saved. It writes:

- `morph/model.json`: tables, fields, joins, enums and what each column means
- `morph/reports/*.json`: up to eight reports picked from your schema
- `morph/actions.json`: the actions your UPDATE policies allow (move a stage, reassign an owner)
- `supabase/migrations/<timestamp>_morph.sql`: one migration

Use a role that can't bypass RLS. `init` prints the SQL to create one if you need it.

## 2. Push the migration

```bash
supabase db push
npx morph-reports doctor
```

`doctor` checks the views, functions and policies exist and that no service-role key is in your env files.

## 3. Add the component

```tsx
import { MorphProvider, MorphDashboard } from '@morph-reports/react';
import { supabase } from './supabase'; // your normal client, signed in as the user
import model from '../morph/model.json';
import actions from '../morph/actions.json';

const reports = Object.values(import.meta.glob('../morph/reports/*.json', { eager: true, import: 'default' }));

export function ReportsPage() {
  return (
    <MorphProvider supabase={supabase} model={model} reports={reports} actions={actions}>
      <MorphDashboard title="Reports" />
    </MorphProvider>
  );
}
```

## Lovable: one prompt

Paste this into the Lovable chat:

> Add Morph reports to this app.
> 1. Run `npx morph-reports init --yes` against the Supabase database (use a read-only connection string, never the service-role key) and commit the `morph/` folder and the new file in `supabase/migrations/`.
> 2. Apply the migration.
> 3. Install `@morph-reports/react`. Create a page at `/admin/reports` that wraps `<MorphDashboard title="Reports" />` in `<MorphProvider>` with the existing supabase client, `morph/model.json`, `morph/actions.json` and every file in `morph/reports/` (use `import.meta.glob`).
> 4. Only signed-in users can open the page. Don't write any SQL for reports.

And add this to the project knowledge so later edits stay on track:

> Morph reports live in `morph/reports/*.json`. To change a report, edit its JSON spec. Never hand-write SQL for reports. After changing the database schema, run `npx morph-reports scan --yes` and `npx morph-reports migrate`, then apply the new migration.

## Next.js (app router)

`MorphProvider` is a client component. Put it in a file with `'use client'` and render it from your page. Reports render a skeleton until their data arrives, on the server and on first paint, so the markup matches.

```tsx
'use client';
import { MorphProvider, MorphReport } from '@morph-reports/react';
import { createBrowserClient } from '@supabase/ssr';
// ...import model, reports, actions as JSON

const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function Reports() {
  return (
    <MorphProvider supabase={supabase} model={model} reports={reports} actions={actions}>
      <MorphReport report="deals-by-stage" />
    </MorphProvider>
  );
}
```

## Vite

See [`examples/crm-vite`](../examples/crm-vite) for a complete app against the `crm` fixture.
