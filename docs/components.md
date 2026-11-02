# Components and theming

```bash
npm i @morph-reports/react
```

## `<MorphProvider>`

| Prop | |
| --- | --- |
| `supabase` | Your supabase-js client, signed in as the viewer. Never a service-role client. |
| `model`, `reports`, `actions` | The contents of `morph/`. |
| `theme` | `{ accent, accentSoft, radius, fontSans, fontMono }` or any Morph token. Optional. |
| `config` | `{ stuckDays, idleDays, ownerCap, rowCap, locale }`. Defaults 14, 30, 5, 50 000, `en-ZA`. |
| `messages` | Override any string from `locales/en.json`. |
| `onAction` | Called after apply, undo or failure. |
| `dev` | Shows the `{ }` spec panel and spec warnings. |

## `<MorphReport report="id" />`

Header with the source line, group and stuck toggles, a stacked bar chart you can click to filter, a grouped table with totals, aging bars, row actions and a bulk bar. Props: `view`, `actions` (`false` or a list of action ids), `filters`, `onRowClick`, `height`, `showSpec`.

## `<MorphDashboard />`

KPI tiles, every report's main widget on a 12-column grid, and "Next best actions" (owners over the cap, rows idle too long), each opening a preview. Props: `reports` (ids, in order), `title`, `actions`, `primary`.

## Widgets

`Kanban`, `Balancer`, `Queue`, `KpiFix`, `HeatmapWidget`, `ColumnWidget`, `FunnelWidget`, `WorkloadWidget`, `KpiWidget`. Each takes `{ report, widget, view?, actions? }` and has Report, Act and Combined views; the view switcher only shows when the viewer can act.

Register your own:

```tsx
import { registerWidget } from '@morph-reports/react';
registerWidget('timeline', MyTimeline);
```

## `<MorphAuditLog />` and `<ViewerLine />`

The action log with Undo, and the "Viewing as Thandi M." line that shows whose access the data reflects.

## Theming

Morph ships light-mode tokens: accent `#2d5bea`, Geist for text and Geist Mono for numbers. If your app defines shadcn CSS variables (`--primary`, `--radius`, `--border`...), Morph picks them up automatically. Otherwise pass `theme`:

```tsx
<MorphProvider theme={{ accent: '#7c3aed', radius: '10px' }} ...>
```

Green only ever means "good" in data (a target met). Red means stuck or over the cap.

## Accessibility

Every chart bar and heatmap cell is a button with a label. Drag and drop has a click and keyboard path. Picks and results are announced to screen readers. The preview is a focus-trapped dialog that returns focus where it came from. Component tests run axe on the CRM fixture.
