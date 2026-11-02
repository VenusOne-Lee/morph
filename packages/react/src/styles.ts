/**
 * Morph default theme (§2). Every colour, corner and font is a CSS variable
 * under `.morph-root`, so the host app can override any of them, and the
 * provider maps the host page's own theme onto them (theme.ts, MO-514).
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
  --morph-accent-text:var(--morph-accent);--morph-focus:var(--morph-accent);
  --morph-series-2:#cfd6e0;--morph-bar-radius:4px;--morph-th-bg:var(--morph-sunken);--morph-th-line:var(--morph-line);
  --morph-radius:8px;--morph-radius-lg:12px;--morph-radius-control:var(--morph-radius);--morph-radius-modal:16px;
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

.morph-btn{appearance:none;font:inherit;font-size:13px;font-weight:500;min-height:32px;min-width:24px;padding:5px 12px;border-radius:var(--morph-radius-control);border:1px solid var(--morph-line);background:var(--morph-surface);color:var(--morph-ink);cursor:pointer;transition:background var(--morph-fast),border-color var(--morph-fast);display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.morph-btn:hover{background:var(--morph-sunken)}
.morph-btn:disabled{opacity:.55;cursor:not-allowed}
.morph-btn.primary{background:var(--morph-accent);border-color:var(--morph-accent);color:var(--morph-accent-ink)}
.morph-btn.primary:hover{filter:brightness(.95)}
.morph-btn.ghost{border-color:transparent;background:transparent}
.morph-btn.ghost:hover{background:var(--morph-sunken)}
.morph-btn.sm{min-height:28px;padding:3px 10px;font-size:12.5px}
.morph-root :focus-visible{outline:2px solid var(--morph-focus);outline-offset:2px}

.morph-badge{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;padding:2px 9px;border-radius:999px;background:var(--morph-sunken);color:var(--morph-ink-2);white-space:nowrap}
.morph-badge.accent{background:var(--morph-accent-soft);color:var(--morph-accent-text)}
.morph-badge.good{background:var(--morph-good-soft);color:var(--morph-good)}
.morph-badge.warn{background:var(--morph-warn-soft);color:var(--morph-warn)}
.morph-badge.bad{background:var(--morph-bad-soft);color:var(--morph-bad)}
.morph-badge .dot{width:6px;height:6px;border-radius:50%;background:currentColor}

.morph-seg{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--morph-line);border-radius:var(--morph-radius-control);background:var(--morph-surface)}
.morph-seg-label{font-size:12.5px;color:var(--morph-muted);padding:0 6px}
.morph-seg button{appearance:none;font:inherit;font-size:12.5px;min-height:26px;padding:2px 10px;border-radius:max(0px,calc(var(--morph-radius-control) - 3px));border:0;background:transparent;color:var(--morph-ink-2);cursor:pointer}
.morph-seg button[aria-pressed="true"]{background:var(--morph-accent-soft);color:var(--morph-accent-text);font-weight:500}
.morph-seg.views button[data-view="report"][aria-pressed="true"]{background:var(--morph-sunken);color:var(--morph-ink)}
.morph-seg.views button[data-view="combined"][aria-pressed="true"]{background:var(--morph-accent-soft);color:var(--morph-accent-text)}

.morph-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:var(--morph-muted)}
.morph-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 10px;border-radius:999px;background:var(--morph-accent-soft);color:var(--morph-accent-text);font-size:12.5px}
.morph-chip button{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;min-width:24px;min-height:24px;border-radius:50%;font-size:14px;line-height:1}

.morph-chart{width:100%;overflow-x:auto}
.morph-chart svg{display:block;min-width:420px;width:100%;height:auto}
.morph-chart text{font-family:var(--morph-sans);font-size:12.5px;fill:var(--morph-muted)}
.morph-chart .lbl{fill:var(--morph-ink);font-weight:500}
.morph-chart .val{fill:var(--morph-ink);font-weight:600}
.morph-chart .grid{stroke:var(--morph-line)}
.morph-chart .bar{cursor:pointer}
.morph-chart rect.mk{rx:var(--morph-bar-radius)}
.morph-chart .bar:focus-visible rect{outline:none;stroke:var(--morph-ink);stroke-width:2}
.morph-chart .dim{opacity:.35}
.morph-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--morph-muted);margin-top:6px}
.morph-legend i{display:inline-block;width:10px;height:10px;border-radius:min(3px,var(--morph-bar-radius));margin-right:6px;vertical-align:-1px}

.morph-table-wrap{overflow-x:auto;border-top:1px solid var(--morph-line)}
.morph-table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:640px}
.morph-table th{background:var(--morph-th-bg);color:var(--morph-ink-2);font-weight:500;font-size:12.5px;text-align:left;padding:9px 12px;border-bottom:1px solid var(--morph-th-line);white-space:nowrap}
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

.morph-bulk{position:sticky;bottom:max(12px,env(safe-area-inset-bottom));margin:12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;border-radius:var(--morph-radius-lg);background:var(--morph-ink);color:#fff;box-shadow:var(--morph-shadow-modal);z-index:2}
.morph-bulk select{font:inherit;font-size:13px;min-height:30px;border-radius:max(0px,calc(var(--morph-radius-control) - 2px));border:1px solid color-mix(in srgb,var(--morph-ink) 70%,#fff);background:color-mix(in srgb,var(--morph-ink) 88%,#fff);color:#fff;padding:2px 8px}
.morph-bulk .morph-btn{background:color-mix(in srgb,var(--morph-ink) 88%,#fff);color:#fff;border-color:color-mix(in srgb,var(--morph-ink) 70%,#fff)}
.morph-bulk .morph-btn.primary{background:var(--morph-accent);border-color:var(--morph-accent);color:var(--morph-accent-ink)}
.morph-bulk .note{font-size:12.5px;color:#c9d1dc}

.morph-overlay{position:fixed;inset:0;background:color-mix(in srgb,var(--morph-ink) 42%,transparent);display:flex;align-items:flex-start;justify-content:center;padding:max(16px,4vh) 16px;z-index:1000;overflow-y:auto}
.morph-modal{background:var(--morph-surface);border-radius:var(--morph-radius-modal);box-shadow:var(--morph-shadow-modal);width:min(720px,100%);color:var(--morph-ink);font-family:var(--morph-sans)}
.morph-modal-head{padding:18px 22px 14px;border-bottom:1px solid var(--morph-line);display:flex;justify-content:space-between;gap:12px}
.morph-modal-title{font-size:20px;font-weight:600;margin-top:8px}
.morph-modal-body{padding:16px 22px;display:grid;gap:18px}
.morph-modal-foot{padding:14px 22px;border-top:1px solid var(--morph-line);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.morph-eyebrow{font:12px var(--morph-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--morph-ink-2);margin-bottom:8px}
.morph-select{font:inherit;min-height:40px;width:min(360px,100%);padding:6px 10px;border-radius:var(--morph-radius-control);border:1px solid var(--morph-line);background:var(--morph-surface);color:var(--morph-ink)}
.morph-impact{display:grid;grid-template-columns:minmax(80px,140px) 1fr auto;gap:8px 14px;align-items:center;font-size:13.5px}
.morph-impact .bars{display:grid;gap:4px}
.morph-impact .now{height:7px;border-radius:min(4px,var(--morph-bar-radius));background:var(--morph-series-2)}
.morph-impact .after{height:7px;border-radius:min(4px,var(--morph-bar-radius));background:var(--morph-accent)}
.morph-impact .after.over{background:var(--morph-bad)}
.morph-diff{border:1px solid var(--morph-line);border-radius:var(--morph-radius-lg);overflow:hidden;overflow-x:auto}
.morph-diff table{width:100%;border-collapse:collapse;font-size:13.5px}
.morph-diff th{background:var(--morph-sunken);text-align:left;font-weight:500;font-size:12.5px;color:var(--morph-ink-2);padding:8px 12px}
.morph-diff td{padding:8px 12px;border-top:1px solid var(--morph-line)}
.morph-diff del{color:var(--morph-bad)}
.morph-diff ins{color:var(--morph-accent-text);text-decoration:none;font-weight:500}
.morph-checks{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13.5px}
.morph-checks li{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.morph-checks .ok{color:var(--morph-good)}
.morph-checks .no{color:var(--morph-bad)}
.morph-code{font:12.5px var(--morph-mono);background:var(--morph-sunken);padding:1px 6px;border-radius:5px}
.morph-spec{margin:0;font:12px/1.55 var(--morph-mono);background:var(--morph-sunken);border-radius:var(--morph-radius);padding:12px 14px;max-height:320px;overflow:auto;white-space:pre;color:var(--morph-ink)}
.morph-btn.here{border-style:dashed;border-color:var(--morph-accent);color:var(--morph-accent-text);background:var(--morph-surface)}
.morph-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.morph-kpis .morph-kpi{border:1px solid var(--morph-line);border-radius:var(--morph-radius-lg);padding:12px 14px;background:var(--morph-surface)}
.morph-includes{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--morph-ink-2)}
.morph-alert{padding:10px 12px;border-radius:var(--morph-radius);background:var(--morph-bad-soft);color:var(--morph-bad);font-size:13.5px}
.morph-alert.warn{background:var(--morph-warn-soft);color:var(--morph-warn)}
.morph-alert.info{background:var(--morph-accent-soft);color:var(--morph-accent-text)}

.morph-toasts{position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);display:grid;gap:8px;z-index:1001;width:min(560px,calc(100% - 32px))}
.morph-toast{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:10px 12px 10px 16px;border-radius:var(--morph-radius-lg);background:var(--morph-ink);color:#fff;box-shadow:var(--morph-shadow-modal);font-size:13.5px;animation:morph-toast-in var(--morph-base) ease-out}
.morph-toast .morph-btn{background:transparent;color:#fff;border-color:color-mix(in srgb,var(--morph-ink) 70%,#fff)}
@keyframes morph-toast-in{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}

.morph-skel{background:linear-gradient(90deg,var(--morph-sunken),color-mix(in srgb,var(--morph-line) 60%,var(--morph-sunken)),var(--morph-sunken));background-size:200% 100%;animation:morph-shimmer 1.4s linear infinite;border-radius:6px}
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
.morph-heat button{appearance:none;font:inherit;font-weight:600;min-height:36px;border-radius:min(6px,var(--morph-radius));border:0;cursor:pointer;color:var(--morph-ink)}
.morph-viewer{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--morph-ink-2)}
.morph-avatar{width:26px;height:26px;border-radius:50%;background:var(--morph-accent-soft);color:var(--morph-accent-text);display:grid;place-items:center;font-size:11.5px;font-weight:600}
.morph-suggest{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--morph-line);font-size:13.5px}
.morph-suggest:last-child{border-bottom:0}
.morph-kpi.drill{appearance:none;font:inherit;text-align:left;color:inherit;cursor:pointer;width:100%;transition:border-color var(--morph-fast),box-shadow var(--morph-fast)}
.morph-kpi.drill:hover{border-color:color-mix(in srgb,var(--morph-accent) 45%,var(--morph-line));box-shadow:var(--morph-shadow)}
.morph-kpi .go{float:right;color:var(--morph-muted);font-size:16px;line-height:1;transition:transform var(--morph-fast)}
.morph-kpi.drill:hover .go{color:var(--morph-accent-text);transform:translateX(2px)}
.morph-rowname{appearance:none;border:0;background:none;padding:0;font:inherit;font-weight:500;color:var(--morph-ink);cursor:pointer;text-align:left;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:3px}
.morph-table tr.clickable:hover td{background:color-mix(in srgb,var(--morph-sunken) 70%,var(--morph-surface))}
.morph-table tr.clickable:hover .morph-rowname,.morph-rowname:focus-visible{text-decoration-color:currentColor}

.morph-drill-overlay{position:fixed;inset:0;background:color-mix(in srgb,var(--morph-ink) 28%,transparent);display:flex;justify-content:flex-end;z-index:900;animation:morph-fade var(--morph-base) ease-out}
.morph-drill{background:var(--morph-surface);width:min(600px,100%);height:100%;display:flex;flex-direction:column;box-shadow:var(--morph-shadow-modal);color:var(--morph-ink);font-family:var(--morph-sans);animation:morph-slide var(--morph-base) ease-out}
.morph-drill-head{padding:14px 22px 16px;border-bottom:1px solid var(--morph-line);display:grid;gap:10px}
.morph-drill-nav{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:28px}
.morph-drill-back{margin-left:-10px;color:var(--morph-ink-2)}
.morph-drill-title{font-size:21px;font-weight:600;letter-spacing:-.02em;outline:none}
.morph-drill-sub{font-size:13.5px;color:var(--morph-ink-2);margin-top:2px}
.morph-drill-tags{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
.morph-drill-owner{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--morph-ink-2)}
.morph-drill-owner .morph-avatar{width:22px;height:22px;font-size:10.5px}
.morph-drill-body{flex:1;overflow-y:auto;padding:6px 22px 22px}
.morph-drill-foot{padding:10px 22px;border-top:1px solid var(--morph-line);font-size:12px;color:var(--morph-muted)}
.morph-drill-list{list-style:none;margin:0 -10px;padding:0}
.morph-drill-list li{border-bottom:1px solid var(--morph-line)}
.morph-drill-list li:last-child{border-bottom:0}
.morph-drill-row{appearance:none;border:0;background:none;font:inherit;color:inherit;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto auto 14px;gap:14px;align-items:center;padding:11px 10px;text-align:left;cursor:pointer;border-radius:var(--morph-radius)}
.morph-drill-row:hover{background:var(--morph-sunken)}
.morph-drill-row .name{display:grid;min-width:0}
.morph-drill-row .name b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.morph-drill-row .sub{font-size:12.5px;color:var(--morph-muted)}
.morph-drill-row .val{font-family:var(--morph-mono);font-size:13px;text-align:right}
.morph-drill-row .morph-age .track{width:56px}
.morph-drill-row .chev{color:var(--morph-muted);font-size:18px;line-height:1}
.morph-record{display:grid;gap:22px;padding-top:16px}
.morph-record-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.morph-record-stats>div{border:1px solid var(--morph-line);border-radius:var(--morph-radius-lg);padding:12px 14px}
.morph-record-stats .label{font-size:12.5px;color:var(--morph-ink-2)}
.morph-record-stats .value{font:600 24px var(--morph-mono);letter-spacing:-.02em;margin-top:2px}
.morph-record-stats .value.bad{color:var(--morph-bad)}
.morph-record-h{font-size:12px;font-family:var(--morph-mono);text-transform:uppercase;letter-spacing:.06em;font-weight:500;color:var(--morph-ink-2);margin:0 0 10px}
.morph-record-act{background:var(--morph-sunken);border-radius:var(--morph-radius-lg);padding:14px 16px}
.morph-record-actrow{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:center}
.morph-record-actrow+.morph-record-actrow{margin-top:8px}
.morph-record-actrow label{font-size:13px;color:var(--morph-ink-2)}
.morph-record-actrow .morph-select{width:100%;min-height:34px}
.morph-record-dl{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 20px}
.morph-record-dl>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--morph-line);font-size:13.5px}
.morph-record-dl dt{color:var(--morph-muted)}
.morph-record-dl dd{margin:0;text-align:right;font-weight:500;overflow-wrap:anywhere}
.morph-record-dl dd.morph-num{font-family:var(--morph-mono);font-weight:400}
.morph-timeline{list-style:none;margin:0;padding:0;display:grid}
.morph-timeline li{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:10px;align-items:start;padding:8px 0;font-size:13.5px;position:relative}
.morph-timeline li .dot{width:8px;height:8px;border-radius:50%;background:var(--morph-accent);margin-top:7px;justify-self:center}
.morph-timeline li:not(:last-child)::before{content:"";position:absolute;left:6.5px;top:22px;bottom:-6px;width:1px;background:var(--morph-line)}
.morph-timeline li.undone{color:var(--morph-muted)}
.morph-timeline li.undone .dot{background:var(--morph-series-2)}
.morph-timeline .sub{font-size:12px;color:var(--morph-muted)}
@keyframes morph-fade{from{opacity:0}}
@keyframes morph-slide{from{transform:translateX(24px);opacity:.6}}
@media (max-width:620px){.morph-drill{width:100%}.morph-record-actrow{grid-template-columns:1fr auto}.morph-record-actrow label{grid-column:1/-1}}
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

