/**
 * Morph default theme (§2). Every colour is a CSS variable under
 * `.morph-root`, so the host app can override any of them, and the
 * provider maps shadcn/ui variables onto them when present (MO-514).
 * Light mode only. Green is the semantic "good" state, never decoration.
 */
export const MORPH_CSS = /* css */ `
.morph-root{
  --morph-bg:#f7f8fa;--morph-surface:#fff;--morph-sunken:#f2f4f7;
  --morph-ink:#0d1726;--morph-ink-2:#344154;--morph-muted:#6b7686;--morph-line:#e4e7ec;
  --morph-accent:#2d5bea;--morph-accent-soft:#eef2fe;--morph-accent-ink:#fff;
  --morph-good:#12805c;--morph-good-soft:#e7f6ef;
  --morph-warn:#b5660b;--morph-warn-soft:#fdf3e4;
  --morph-bad:#c2392f;--morph-bad-soft:#fdeceb;
  --morph-radius:8px;--morph-radius-lg:12px;
  --morph-shadow:0 1px 2px rgba(16,24,40,.05),0 1px 3px rgba(16,24,40,.06);
  --morph-shadow-modal:0 12px 32px -8px rgba(16,24,40,.14);
  --morph-sans:Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --morph-mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --morph-fast:120ms;--morph-base:200ms;
  color-scheme:light;font-family:var(--morph-sans);font-size:14.5px;line-height:1.5;color:var(--morph-ink);
  -webkit-font-smoothing:antialiased;min-width:0
}
.morph-root *,.morph-root *::before,.morph-root *::after{box-sizing:border-box}
.morph-root h2,.morph-root h3{letter-spacing:-.02em;text-wrap:balance;margin:0}
.morph-num{font-variant-numeric:tabular-nums}
.morph-mono{font-family:var(--morph-mono)}
.morph-muted{color:var(--morph-muted)}
.morph-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

.morph-panel{background:var(--morph-surface);border:1px solid var(--morph-line);border-radius:var(--morph-radius-lg);box-shadow:var(--morph-shadow);min-width:0;display:flex;flex-direction:column}
.morph-panel-head{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:flex-start;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--morph-line)}
.morph-panel-title{font-size:16px;font-weight:600}
.morph-panel-src{font:12.5px var(--morph-mono);color:var(--morph-muted);margin-top:2px;overflow-wrap:anywhere}
.morph-panel-body{padding:14px 18px;min-width:0}
.morph-panel-foot{padding:10px 18px;border-top:1px solid var(--morph-line);font-size:12.5px;color:var(--morph-muted);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.morph-controls{display:flex;gap:8px;flex-wrap:wrap}

.morph-btn{appearance:none;font:inherit;font-size:13px;font-weight:500;min-height:32px;min-width:24px;padding:5px 12px;border-radius:var(--morph-radius);border:1px solid var(--morph-line);background:var(--morph-surface);color:var(--morph-ink);cursor:pointer;transition:background var(--morph-fast),border-color var(--morph-fast);display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.morph-btn:hover{background:var(--morph-sunken)}
.morph-btn:disabled{opacity:.55;cursor:not-allowed}
.morph-btn.primary{background:var(--morph-accent);border-color:var(--morph-accent);color:var(--morph-accent-ink)}
.morph-btn.primary:hover{filter:brightness(.95)}
.morph-btn.ghost{border-color:transparent;background:transparent}
.morph-btn.ghost:hover{background:var(--morph-sunken)}
.morph-btn.sm{min-height:28px;padding:3px 10px;font-size:12.5px}
.morph-root :focus-visible{outline:2px solid var(--morph-accent);outline-offset:2px}

.morph-badge{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;padding:2px 9px;border-radius:999px;background:var(--morph-sunken);color:var(--morph-ink-2);white-space:nowrap}
.morph-badge.accent{background:var(--morph-accent-soft);color:var(--morph-accent)}
.morph-badge.good{background:var(--morph-good-soft);color:var(--morph-good)}
.morph-badge.warn{background:var(--morph-warn-soft);color:var(--morph-warn)}
.morph-badge.bad{background:var(--morph-bad-soft);color:var(--morph-bad)}
.morph-badge .dot{width:6px;height:6px;border-radius:50%;background:currentColor}

.morph-seg{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--morph-line);border-radius:var(--morph-radius);background:var(--morph-surface)}
.morph-seg-label{font-size:12.5px;color:var(--morph-muted);padding:0 6px}
.morph-seg button{appearance:none;font:inherit;font-size:12.5px;min-height:26px;padding:2px 10px;border-radius:6px;border:0;background:transparent;color:var(--morph-ink-2);cursor:pointer}
.morph-seg button[aria-pressed="true"]{background:var(--morph-accent-soft);color:var(--morph-accent);font-weight:500}
.morph-seg.views button[data-view="report"][aria-pressed="true"]{background:var(--morph-sunken);color:var(--morph-ink)}
.morph-seg.views button[data-view="combined"][aria-pressed="true"]{background:var(--morph-accent-soft);color:var(--morph-accent)}

.morph-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:var(--morph-muted)}
.morph-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 10px;border-radius:999px;background:var(--morph-accent-soft);color:var(--morph-accent);font-size:12.5px}
.morph-chip button{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;min-width:24px;min-height:24px;border-radius:50%;font-size:14px;line-height:1}

.morph-chart{width:100%;overflow-x:auto}
.morph-chart svg{display:block;min-width:420px;width:100%;height:auto}
.morph-chart text{font-family:var(--morph-sans);font-size:12.5px;fill:var(--morph-muted)}
.morph-chart .lbl{fill:var(--morph-ink);font-weight:500}
.morph-chart .val{fill:var(--morph-ink);font-weight:600}
.morph-chart .grid{stroke:var(--morph-line)}
.morph-chart .bar{cursor:pointer}
.morph-chart .bar:focus-visible rect{outline:none;stroke:var(--morph-ink);stroke-width:2}
.morph-chart .dim{opacity:.35}
.morph-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--morph-muted);margin-top:6px}
.morph-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}

.morph-table-wrap{overflow-x:auto;border-top:1px solid var(--morph-line)}
.morph-table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:640px}
.morph-table th{background:var(--morph-sunken);color:var(--morph-ink-2);font-weight:500;font-size:12.5px;text-align:left;padding:9px 12px;border-bottom:1px solid var(--morph-line);white-space:nowrap}
.morph-table td{padding:9px 12px;border-bottom:1px solid var(--morph-line);vertical-align:middle}
.morph-table .num{text-align:right;font-variant-numeric:tabular-nums}
.morph-table tr.group td{background:var(--morph-sunken);font-weight:600}
.morph-table tr.group td span{font-weight:400;color:var(--morph-muted)}
.morph-table tr.total td{font-weight:600}
.morph-table tr.sel td{background:var(--morph-accent-soft)}
.morph-table tr.clickable{cursor:pointer}
.morph-table .sub{font:11.5px var(--morph-mono);color:var(--morph-muted)}
.morph-table input[type=checkbox]{width:18px;height:18px;accent-color:var(--morph-accent);margin:3px}
.morph-age{display:flex;align-items:center;gap:10px;justify-content:flex-end}
.morph-age .track{width:86px;height:6px;border-radius:3px;background:var(--morph-sunken);overflow:hidden}
.morph-age .fill{display:block;height:100%;background:var(--morph-accent);border-radius:3px}
.morph-age.late .fill{background:var(--morph-bad)}
.morph-age.late b{color:var(--morph-bad)}
.morph-age b{font-weight:500;min-width:2ch;text-align:right;font-variant-numeric:tabular-nums}
.morph-rowacts{display:flex;gap:6px;justify-content:flex-end}

@keyframes morph-flash-apply{from{background:var(--morph-good-soft)}to{background:transparent}}
@keyframes morph-flash-undo{from{background:var(--morph-accent-soft)}to{background:transparent}}
.morph-flash-apply td,.morph-flash-apply.card{animation:morph-flash-apply 1.6s ease-out}
.morph-flash-undo td,.morph-flash-undo.card{animation:morph-flash-undo 1.6s ease-out}

.morph-bulk{position:sticky;bottom:max(12px,env(safe-area-inset-bottom));margin:12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;border-radius:var(--morph-radius-lg);background:#0d1726;color:#fff;box-shadow:var(--morph-shadow-modal);z-index:2}
.morph-bulk select{font:inherit;font-size:13px;min-height:30px;border-radius:6px;border:1px solid #344154;background:#1b2636;color:#fff;padding:2px 8px}
.morph-bulk .morph-btn{background:#1b2636;color:#fff;border-color:#344154}
.morph-bulk .morph-btn.primary{background:var(--morph-accent);border-color:var(--morph-accent)}
.morph-bulk .note{font-size:12.5px;color:#c9d1dc}

.morph-overlay{position:fixed;inset:0;background:rgba(13,23,38,.42);display:flex;align-items:flex-start;justify-content:center;padding:max(16px,4vh) 16px;z-index:1000;overflow-y:auto}
.morph-modal{background:var(--morph-surface);border-radius:16px;box-shadow:var(--morph-shadow-modal);width:min(720px,100%);color:var(--morph-ink);font-family:var(--morph-sans)}
.morph-modal-head{padding:18px 22px 14px;border-bottom:1px solid var(--morph-line);display:flex;justify-content:space-between;gap:12px}
.morph-modal-title{font-size:20px;font-weight:600;margin-top:8px}
.morph-modal-body{padding:16px 22px;display:grid;gap:18px}
.morph-modal-foot{padding:14px 22px;border-top:1px solid var(--morph-line);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.morph-eyebrow{font:12px var(--morph-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--morph-ink-2);margin-bottom:8px}
.morph-select{font:inherit;min-height:40px;width:min(360px,100%);padding:6px 10px;border-radius:var(--morph-radius);border:1px solid var(--morph-line);background:var(--morph-surface);color:var(--morph-ink)}
.morph-impact{display:grid;grid-template-columns:minmax(80px,140px) 1fr auto;gap:8px 14px;align-items:center;font-size:13.5px}
.morph-impact .bars{display:grid;gap:4px}
.morph-impact .now{height:7px;border-radius:4px;background:#cfd6e0}
.morph-impact .after{height:7px;border-radius:4px;background:var(--morph-accent)}
.morph-impact .after.over{background:var(--morph-bad)}
.morph-diff{border:1px solid var(--morph-line);border-radius:var(--morph-radius-lg);overflow:hidden;overflow-x:auto}
.morph-diff table{width:100%;border-collapse:collapse;font-size:13.5px}
.morph-diff th{background:var(--morph-sunken);text-align:left;font-weight:500;font-size:12.5px;color:var(--morph-ink-2);padding:8px 12px}
.morph-diff td{padding:8px 12px;border-top:1px solid var(--morph-line)}
.morph-diff del{color:var(--morph-bad)}
.morph-diff ins{color:var(--morph-accent);text-decoration:none;font-weight:500}
.morph-checks{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13.5px}
.morph-checks li{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.morph-checks .ok{color:var(--morph-good)}
.morph-checks .no{color:var(--morph-bad)}
.morph-code{font:12.5px var(--morph-mono);background:var(--morph-sunken);padding:1px 6px;border-radius:5px}
.morph-spec{margin:0;font:12px/1.55 var(--morph-mono);background:var(--morph-sunken);border-radius:var(--morph-radius);padding:12px 14px;max-height:320px;overflow:auto;white-space:pre;color:var(--morph-ink)}
.morph-btn.here{border-style:dashed;border-color:var(--morph-accent);color:var(--morph-accent);background:var(--morph-surface)}
.morph-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.morph-kpis .morph-kpi{border:1px solid var(--morph-line);border-radius:var(--morph-radius-lg);padding:12px 14px;background:var(--morph-surface)}
.morph-includes{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--morph-ink-2)}
.morph-alert{padding:10px 12px;border-radius:var(--morph-radius);background:var(--morph-bad-soft);color:var(--morph-bad);font-size:13.5px}
.morph-alert.warn{background:var(--morph-warn-soft);color:var(--morph-warn)}
.morph-alert.info{background:var(--morph-accent-soft);color:var(--morph-accent)}

.morph-toasts{position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);display:grid;gap:8px;z-index:1001;width:min(560px,calc(100% - 32px))}
.morph-toast{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:10px 12px 10px 16px;border-radius:var(--morph-radius-lg);background:#0d1726;color:#fff;box-shadow:var(--morph-shadow-modal);font-size:13.5px;animation:morph-toast-in var(--morph-base) ease-out}
.morph-toast .morph-btn{background:transparent;color:#fff;border-color:#344154}
@keyframes morph-toast-in{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}

.morph-skel{background:linear-gradient(90deg,var(--morph-sunken),#e9edf2,var(--morph-sunken));background-size:200% 100%;animation:morph-shimmer 1.4s linear infinite;border-radius:6px}
@keyframes morph-shimmer{to{background-position:-200% 0}}
.morph-state{padding:28px 18px;text-align:center;color:var(--morph-ink-2);display:grid;gap:10px;justify-items:center}
.morph-state.error{color:var(--morph-bad)}
.morph-state small{color:var(--morph-muted)}

.morph-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
.morph-grid>*{min-width:0}
.morph-span-3{grid-column:span 3}.morph-span-4{grid-column:span 4}.morph-span-5{grid-column:span 5}.morph-span-6{grid-column:span 6}.morph-span-7{grid-column:span 7}.morph-span-8{grid-column:span 8}.morph-span-12{grid-column:span 12}
@media (max-width:980px){.morph-span-3{grid-column:span 6}.morph-span-4,.morph-span-5,.morph-span-7,.morph-span-8{grid-column:span 12}}
@media (max-width:620px){.morph-grid>*{grid-column:span 12!important}}
.morph-kpi .label{font-size:13px;color:var(--morph-ink-2)}
.morph-kpi .value{font-size:26px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.morph-kpi .delta{font-size:12.5px;margin-left:8px}
.morph-kpi .delta.up{color:var(--morph-good)}.morph-kpi .delta.down{color:var(--morph-bad)}

.morph-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(180px,1fr);gap:10px;overflow-x:auto;padding-bottom:4px}
.morph-col{background:var(--morph-sunken);border-radius:var(--morph-radius-lg);padding:8px;display:flex;flex-direction:column;gap:8px;min-height:140px;border:2px solid transparent}
.morph-col.target{border-color:var(--morph-accent);border-style:dashed;background:var(--morph-accent-soft)}
.morph-col-head{display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;padding:2px 4px;gap:6px}
.morph-col-head span{font-weight:400;color:var(--morph-muted)}
.morph-meter{height:5px;border-radius:3px;background:var(--morph-line);overflow:hidden;display:flex}
.morph-meter i{display:block;height:100%}
.morph-card{background:var(--morph-surface);border:1px solid var(--morph-line);border-radius:var(--morph-radius);padding:8px 10px;font-size:13px;cursor:grab;text-align:left;font:inherit;width:100%;color:var(--morph-ink);display:block}
.morph-card[aria-pressed="true"]{border-color:var(--morph-accent);box-shadow:0 0 0 2px var(--morph-accent-soft)}
.morph-card.locked{cursor:default}
.morph-card .meta{display:flex;justify-content:space-between;font-size:12px;color:var(--morph-muted);margin-top:2px}
.morph-card .late{color:var(--morph-bad);font-weight:500}
.morph-lanes{display:grid;gap:8px}
.morph-lane{display:grid;grid-template-columns:minmax(90px,130px) 1fr;gap:10px;align-items:center;padding:8px;border-radius:var(--morph-radius);background:var(--morph-sunken);border:2px solid transparent}
.morph-lane.over{background:var(--morph-bad-soft)}
.morph-lane.target{border-color:var(--morph-accent);border-style:dashed}
.morph-lane-chips{display:flex;flex-wrap:wrap;gap:6px}
.morph-ochip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:var(--morph-surface);border:1px solid var(--morph-line);font:inherit;font-size:12.5px;cursor:grab;color:var(--morph-ink)}
.morph-ochip[aria-pressed="true"]{border-color:var(--morph-accent)}
.morph-ochip .reddot{width:6px;height:6px;border-radius:50%;background:var(--morph-bad)}
.morph-qcard{border:1px solid var(--morph-line);border-radius:var(--morph-radius-lg);padding:16px;display:grid;gap:10px}
.morph-qcard .why{color:var(--morph-bad);font-size:13.5px}
.morph-qactions{display:flex;flex-wrap:wrap;gap:8px}
.morph-heat{display:grid;gap:4px;font-size:12.5px}
.morph-heat button{appearance:none;font:inherit;font-weight:600;min-height:36px;border-radius:6px;border:0;cursor:pointer;color:var(--morph-ink)}
.morph-viewer{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--morph-ink-2)}
.morph-avatar{width:26px;height:26px;border-radius:50%;background:var(--morph-accent-soft);color:var(--morph-accent);display:grid;place-items:center;font-size:11.5px;font-weight:600}
.morph-suggest{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--morph-line);font-size:13.5px}
.morph-suggest:last-child{border-bottom:0}
@media (prefers-reduced-motion:reduce){.morph-root *,.morph-toast,.morph-skel{animation:none!important;transition:none!important}}
`;

let injected = false;
/** Injects the default theme once per document. Hosts can skip it with `injectStyles={false}`. */
export function injectStyles(doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (!doc || injected || doc.getElementById('morph-styles')) return;
  const el = doc.createElement('style');
  el.id = 'morph-styles';
  el.textContent = MORPH_CSS;
  doc.head.appendChild(el);
  injected = true;
}

export interface MorphTheme {
  accent?: string;
  accentSoft?: string;
  radius?: string;
  fontSans?: string;
  fontMono?: string;
  [token: string]: string | undefined;
}

const TOKEN: Record<string, string> = { accent: '--morph-accent', accentSoft: '--morph-accent-soft', radius: '--morph-radius', fontSans: '--morph-sans', fontMono: '--morph-mono', line: '--morph-line', ink: '--morph-ink', surface: '--morph-surface', bg: '--morph-bg' };

/** Builds inline CSS variables from a theme prop and, when present, shadcn/ui variables. */
export function themeVars(theme: MorphTheme | undefined, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): Record<string, string> {
  const vars: Record<string, string> = {};
  if (doc?.documentElement && typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(doc.documentElement);
    const hsl = (name: string) => {
      const v = cs.getPropertyValue(name).trim();
      if (!v) return null;
      return /^[\d.]+\s+[\d.]+%\s+[\d.]+%/.test(v) ? `hsl(${v})` : v;
    };
    const primary = hsl('--primary');
    const border = hsl('--border');
    const radius = cs.getPropertyValue('--radius').trim();
    if (primary) {
      vars['--morph-accent'] = primary;
      vars['--morph-accent-soft'] = `color-mix(in srgb, ${primary} 10%, white)`;
    }
    if (border) vars['--morph-line'] = border;
    if (radius) vars['--morph-radius'] = radius;
  }
  for (const [k, v] of Object.entries(theme ?? {})) {
    if (!v) continue;
    vars[k.startsWith('--') ? k : (TOKEN[k] ?? `--morph-${k}`)] = v;
  }
  return vars;
}
