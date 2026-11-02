# Components and theming

```bash
npm i @morph-reports/react
```

## `<MorphProvider>`

| Prop | |
| --- | --- |
| `supabase` | Your supabase-js client, signed in as the viewer. Never a service-role client. |
| `model`, `reports`, `actions` | The contents of `morph/`. |
| `theme` | `'auto'` (default), `'morph'`, `'distinctui'`, or `{ preset?, accent, radius, barRadius, fontSans, ... }` to override single tokens. See Theming. |
| `config` | `{ stuckDays, idleDays, ownerCap, rowCap, locale }`. Defaults 14, 30, 5, 50 000, `en-ZA`. |
| `messages` | Override any string from `locales/en.json`. |
| `onAction` | Called after apply, undo or failure. |
| `recordHref` | `(row, { reportId, table, id }) => url`. Adds "Open in app" to the record view, linking to your own page for that record. |
| `dev` | Shows the `{ }` spec panel and spec warnings. |

## `<MorphReport report="id" />`

Header with the source line, group and stuck toggles, a stacked bar chart you can click to filter, a grouped table with totals, aging bars, row actions and a bulk bar. Props: `view`, `actions` (`false` or a list of action ids), `filters`, `onRowClick`, `drill`, `height`, `showSpec`.

Clicking a bar filters the table. Clicking a row (or its name, by keyboard) opens the record view. Pass `onRowClick` to route to your own record page instead, or `drill={false}` to turn the record view off.

## `<MorphDashboard />`

KPI tiles, every report's main widget on a 12-column grid, and "Next best actions" (owners over the cap, rows idle too long), each opening a preview. Props: `reports` (ids, in order), `title`, `actions`, `primary`.

## Widgets

`Kanban`, `Balancer`, `Queue`, `KpiFix`, `HeatmapWidget`, `ColumnWidget`, `FunnelWidget`, `WorkloadWidget`, `KpiWidget`. Each takes `{ report, widget, view?, actions? }` and has Report, Act and Combined views; the view switcher only shows when the viewer can act.

Register your own:

```tsx
import { registerWidget } from '@morph-reports/react';
registerWidget('timeline', MyTimeline);
```

## Drill-down and the record view

Every number on a dashboard leads to the rows behind it, and every row leads to the record.

- **KPI tiles** (dashboard row and `KpiWidget`), **funnel steps**, **heatmap cells**, **workload bars** and **columns** open a side sheet listing the records behind them, oldest first, with the count and total.
- Pick a row to open the **record view**: status, owner and stuck badges, value and days in stage, the other report fields, **Move to** and **Reassign to** with the same preview, checks and undo as everywhere else, and a **History** of Morph actions on that record with Undo while the window is open.
- Previous and next walk the list without going back. Escape goes back to the list, then closes and returns focus to what you clicked.
- The sheet reads the same cached rows as the widget you clicked, through the report's view and the viewer's RLS. It never fetches columns the report doesn't have, so PII stays off unless the report includes it. A record the viewer can no longer see says so.
- Actions are hidden when the viewer can't use them, and `actions={false}` on the widget or report carries through.

To put one record on a page of your own:

```tsx
<MorphRecord report="deals-by-stage" id={dealId} />
```

From your own code, `useMorph().openDrill({ reportId, title, ids?, recordId? })` opens the sheet.

## `<MorphAuditLog />` and `<ViewerLine />`

The action log with Undo, and the "Viewing as Thandi M." line that shows whose access the data reflects.

## Theming

Reports take on the look of the app they sit in. On mount, `MorphProvider` reads the page around it and maps what it finds onto Morph's tokens, in this order:

| Host has | Morph takes |
| --- | --- |
| distinctUI (`--dui-*` variables, from `@distinctui/css`) | The distinctUI preset: black accent, four greys, Bricolage Grotesque, pill buttons, 22px cards, no shadows, black bars with grey comparisons |
| shadcn/ui, as in Lovable apps (`--primary`, `--foreground`, `--card`, `--muted`, `--border`, `--destructive`, `--ring`, `--radius`), Tailwind v3 HSL channels or v4 full colours | Accent, text, surfaces, lines, the "bad" red, focus ring, corners and bar corners, plus `--font-sans` / `--font-mono` |
| A brand variable (`--color-primary`, `--brand`, `--bs-primary`, `--pico-primary`, ...) | Accent |
| Nothing special | The font and text colour of the element Morph is mounted in |

Morph points at the host's variables (`var(--primary)`) rather than copying them, so it follows the host if they change. Anything not found keeps Morph's defaults (accent `#2d5bea`, Geist and Geist Mono). A few guards keep reports readable:

- Morph stays light. Inside a dark page it keeps its own surfaces and only takes the accent, font and corners.
- An accent too pale to read as text (yellow, orange) gets a darker shade for text, and button text picks black or white by contrast.
- Green only ever means "good" in data (a target met), and host colours never change it. Red means stuck or over the cap.

To turn detection off use `theme="morph"`; to force distinctUI use `theme="distinctui"`. To override single tokens on top of whatever was detected:

```tsx
<MorphProvider theme={{ accent: '#7c3aed', radius: '10px', barRadius: '2px' }} ...>
```

The root element carries `data-morph-theme` (`distinctui`, `shadcn`, `brand-vars`, `computed`, `none` or `morph`) so you can see what was picked up. Try it with `pnpm demo` in `examples/crm-vite` and `?host=lovable`, `?host=ledger` or `?host=distinctui`.

## Accessibility

Every chart bar and heatmap cell is a button with a label. Drag and drop has a click and keyboard path. Picks and results are announced to screen readers. The preview and the drill sheet are focus-trapped dialogs that return focus where they came from; KPI tiles, chart marks and table row names are buttons. Component tests run axe on the CRM fixture.
