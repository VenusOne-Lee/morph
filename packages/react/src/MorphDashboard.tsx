import { useId, useState, type ReactNode } from 'react';
import { formatMoney, type ReportWidget } from '@morph-reports/spec';
import { useMorph } from './context.js';
import { getWidget } from './registry.js';
import { MorphReport } from './MorphReport.js';
import { initials, Panel } from './components/primitives.js';
import { isOpen, isStuck, rowName, terminalPair } from './meta.js';
import { leastLoaded } from './helpers.js';
import { useWidget } from './widgets/frame.js';
import { ownerLoads } from './widgets/Balancer.js';

export interface MorphDashboardProps {
  /** Report ids in order. Defaults to every report in the project. */
  reports?: string[];
  title?: ReactNode;
  /** false hides all actions; a list allows only those action ids. */
  actions?: boolean | string[];
  /** The report that drives the KPI row and next best actions. Defaults to the first with a status and an owner. */
  primary?: string;
  className?: string;
}

const ACT = ['kanban', 'balancer', 'queue', 'kpi-fix'];
const SPAN: Record<string, number> = { kanban: 12, column: 8, funnel: 4, 'kpi-fix': 4, workload: 6, balancer: 6, heatmap: 6, queue: 8, bar: 6, kpi: 4, table: 12 };

/** Who the data is shown for (MO-404). Everything on screen runs as this person through RLS. */
export function ViewerLine() {
  const m = useMorph();
  if (!m.viewer.id) return null;
  return (
    <span className="morph-viewer">
      <span className="morph-avatar" aria-hidden="true">{initials(m.viewer.name)}</span>
      {m.t('viewer.as', { name: m.viewer.name ?? m.viewer.id })}
    </span>
  );
}

/** `<MorphDashboard>` (MO-510): KPI row, each report's main widget on a 12-column grid, and next best actions. */
export function MorphDashboard(props: MorphDashboardProps) {
  const m = useMorph();
  const ids = props.reports ?? m.project.reports.map((r) => r.id);
  const primary =
    props.primary ??
    ids.find((id) => {
      const meta = m.meta(id);
      return meta.status && meta.owner && meta.days;
    }) ??
    ids[0];

  return (
    <div className={`morph-dashboard${props.className ? ` ${props.className}` : ''}`} style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {props.title ? <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>{props.title}</h2> : <span />}
        <ViewerLine />
      </div>
      {primary && <KpiRow report={primary} />}
      <div className="morph-grid">
        {ids.map((id) => {
          const meta = m.meta(id);
          const widget: ReportWidget = meta.spec.widgets.find((w) => ACT.includes(w.type)) ?? meta.spec.widgets.find((w) => w.type !== 'table' && w.type !== 'kpi') ?? meta.spec.widgets[0] ?? { type: 'table' };
          const W = widget.type === 'bar' || widget.type === 'table' ? null : getWidget(widget.type);
          const span = SPAN[widget.type] ?? 6;
          return (
            <div key={id} className={`morph-span-${span}`}>
              {W ? <W report={id} widget={widget} actions={props.actions} /> : <MorphReport report={id} actions={props.actions ?? false} height={480} />}
            </div>
          );
        })}
        {primary && (
          <div className="morph-span-4">
            <NextBest report={primary} actions={props.actions} />
          </div>
        )}
      </div>
    </div>
  );
}

function KpiRow(props: { report: string }) {
  const w = useWidget({ report: props.report, widget: { type: 'kpi' } });
  const { meta, rows, t } = w;
  if (w.status !== 'ready') return null;
  const open = rows.filter((r) => isOpen(meta, r));
  const stuck = open.filter((r) => isStuck(meta, r));
  const idle = open.filter((r) => meta.days && Number(r[meta.days.col]) > meta.idleDays);
  const sum = (l: typeof rows) => (meta.money ? formatMoney(l.reduce((s, r) => s + Number(r[meta.money!.col] ?? 0), 0), meta.money.currency) : String(l.length));
  const tiles = [
    { label: t('kpi.openCount'), value: String(open.length), sub: meta.money ? sum(open) : '' },
    ...(meta.days
      ? [
          { label: t('kpi.stuck', { days: meta.stuckDays }), value: String(stuck.length), sub: meta.money ? sum(stuck) : '', bad: stuck.length > 0 },
          { label: t('kpi.idleTile', { days: meta.idleDays }), value: String(idle.length), sub: meta.money ? sum(idle) : '', bad: idle.length > 0 },
        ]
      : []),
  ];
  return (
    <div className="morph-kpis">
      {tiles.map((k) => (
        <div key={k.label} className="morph-kpi">
          <div className="label">{k.label}</div>
          <div className="value morph-num" style={'bad' in k && k.bad ? { color: 'var(--morph-bad)' } : undefined}>
            {k.value}
            {k.sub && <span className="delta morph-muted" style={{ color: 'var(--morph-ink-2)' }}>{k.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Suggestions computed from the same rows: owners over the cap, rows idle too long. Each opens a preview. */
function NextBest(props: { report: string; actions?: boolean | string[] | undefined }) {
  const w = useWidget({ report: props.report, widget: { type: 'kpi' }, actions: props.actions });
  const { meta, rows, t, m } = w;
  const id = useId();
  const [setTo, setSetTo] = useState('');
  if (w.status !== 'ready') return null;
  const loads = ownerLoads(w);
  const items: ReactNode[] = [];

  if (w.allowed.owner && w.owners) {
    for (const l of loads.filter((x) => x.open.length > meta.ownerCap)) {
      const oldest = [...(l.stuck.length ? l.stuck : l.open)].sort((a, b) => Number(b[meta.days?.col ?? ''] ?? 0) - Number(a[meta.days?.col ?? ''] ?? 0))[0];
      const to = leastLoaded(meta, rows, w.owners, l.id);
      if (!oldest || !to) continue;
      items.push(
        <div key={`cap-${l.id}`} className="morph-suggest">
          <span className="morph-badge bad"><span className="dot" />{t('balancer.overCap')}</span>
          <span>{t('dashboard.suggestOverCap', { owner: l.name, count: l.open.length, cap: meta.ownerCap, to: to.name })} <span className="morph-muted">({rowName(meta, oldest)})</span></span>
          <button type="button" className="morph-btn sm" onClick={(e) => m.openPreview({ actionId: w.allowed.owner!.id, ids: [String(oldest[meta.idCol])], to: to.id, reportId: props.report, returnFocus: e.currentTarget })}>{t('dashboard.apply')}</button>
        </div>,
      );
    }
  }

  const idle = meta.days ? rows.filter((r) => isOpen(meta, r) && Number(r[meta.days!.col]) > meta.idleDays) : [];
  const lose = terminalPair(meta).lose;
  if (w.allowed.stage && idle.length && meta.status) {
    const target = setTo || lose || meta.status.values[0]!;
    const value = meta.money ? formatMoney(idle.reduce((s, r) => s + Number(r[meta.money!.col] ?? 0), 0), meta.money.currency) : String(idle.length);
    const ids = idle.slice(0, w.allowed.stage.bulkMax).map((r) => String(r[meta.idCol]));
    items.push(
      <div key="idle" className="morph-suggest">
        <span className="morph-badge warn"><span className="dot" />{t('kpi.idle', { days: meta.idleDays })}</span>
        <span>{t('dashboard.suggestIdle', { count: idle.length, days: meta.idleDays, value, stage: meta.status.labels[target] ?? target })}</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <label className="morph-sr" htmlFor={`${id}-setall`}>{t('dashboard.setAll')}</label>
          <select id={`${id}-setall`} value={target} onChange={(e) => setSetTo(e.target.value)}>
            {meta.status.values.map((v) => <option key={v} value={v}>{meta.status!.labels[v] ?? v}</option>)}
          </select>
          <button type="button" className="morph-btn sm" onClick={(e) => m.openPreview({ actionId: w.allowed.stage!.id, ids, to: target, reportId: props.report, returnFocus: e.currentTarget })}>{t('dashboard.apply')}</button>
        </span>
      </div>,
    );
  }

  return (
    <Panel title={t('dashboard.nextBest')} labelledBy={`${id}-t`}>
      <div className="morph-panel-body">{items.length ? items : <p className="morph-muted" style={{ margin: 0 }}>{t('dashboard.nextBestEmpty', { days: meta.idleDays })}</p>}</div>
    </Panel>
  );
}
