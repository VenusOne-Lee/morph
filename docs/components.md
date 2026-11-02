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

Every chart bar and heatmap cell is a button with a label. Drag and drop has a click and keyboard path. Picks and results are announced to screen readers. The preview is a focus-trapped dialog that returns focus where it came from. Component tests run axe on the CRM fixture.
