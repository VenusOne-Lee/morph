import { useState } from 'react';
import { aggregate, bucketIndex, bucketLabels, formatMoney } from '@morph-reports/spec';
import { ColumnChart, Funnel, Heatmap } from '../charts/index.js';
import { isOpen, isStuck } from '../meta.js';
import { nounFor } from '../components/PreviewModal.js';
import type { WidgetProps } from '../registry.js';
import { useDrill, useWidget, WidgetFrame } from './frame.js';
import { Balancer } from './Balancer.js';

const num = (o: unknown, k: string, d: number) => (typeof (o as Record<string, unknown> | undefined)?.[k] === 'number' ? ((o as Record<string, number>)[k] as number) : d);

/** Open rows by status × days-in-status bucket (MO-509). */
export function HeatmapWidget(props: WidgetProps) {
  const w = useWidget(props);
  const { meta, rows, t } = w;
  const drill = useDrill(w, props);
  const [active, setActive] = useState<{ row: string; bucket: number } | null>(null);
  const edges = (Array.isArray(props.widget.options?.buckets) ? (props.widget.options!.buckets as number[]) : [7, 14, 30]).slice().sort((a, b) => a - b);
  const st = meta.status;
  if (!st || !meta.days) return <WidgetFrame w={w} widget={props}>{null}</WidgetFrame>;
  const open = rows.filter((r) => isOpen(meta, r));
  const counts = st.open.map((v) => {
    const c = edges.map(() => 0).concat(0);
    for (const r of open) if (r[st.col] === v) c[bucketIndex(Number(r[meta.days!.col]), edges)]! += 1;
    return c;
  });
  const lateFrom = edges.findIndex((e) => e >= meta.stuckDays) + 1 || edges.length;
  return (
    <WidgetFrame w={w} widget={props}>
      <Heatmap
        title={meta.spec.title}
        rows={st.open.map((v) => ({ key: v, label: st.labels[v] ?? v }))}
        buckets={bucketLabels(edges)}
        counts={counts}
        lateFrom={lateFrom}
        active={active}
        onSelect={(row, bucket, el) => {
          setActive({ row, bucket });
          drill(t('drill.bucket', { stage: st.labels[row] ?? row, bucket: bucketLabels(edges)[bucket] ?? '' }), open.filter((r) => r[st.col] === row && bucketIndex(Number(r[meta.days!.col]), edges) === bucket), el);
        }}
      />
      <div className="morph-legend">
        <span><i style={{ background: 'var(--morph-bad)' }} />{t('heatmap.late', { days: meta.stuckDays })}</span>
      </div>
    </WidgetFrame>
  );
}

/** Columns per period with an optional target (MO-507). */
export function ColumnWidget(props: WidgetProps) {
  const w = useWidget(props);
  const { meta, rows, t } = w;
  const drill = useDrill(w, props);
  const months = num(props.widget.options, 'months', 6);
  const target = props.widget.options?.target;
  const groupCol = meta.spec.groupBy?.[0] ? (meta.resolved.column(meta.spec.groupBy[0])?.alias ?? meta.spec.groupBy[0]) : null;
  const now = new Date();
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const sums = new Map<string, number>();
  for (const r of rows) {
    const k = groupCol ? String(r[groupCol] ?? '').slice(0, 7) : '';
    sums.set(k, (sums.get(k) ?? 0) + (meta.money ? Number(r[meta.money.col] ?? 0) : 1));
  }
  const fmtMonth = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleString(w.m.config.locale, { month: 'short', timeZone: 'UTC' });
  return (
    <WidgetFrame w={w} widget={props}>
      <ColumnChart
        title={meta.spec.title}
        format={w.fmt}
        targetLabel={t('dashboard.toTarget')}
        toDateLabel={t('dashboard.toDate')}
        {...(typeof target === 'number' ? { target } : {})}
        onSelect={(key, el) => drill(fmtMonth(key), rows.filter((r) => groupCol && String(r[groupCol] ?? '').slice(0, 7) === key), el)}
        points={keys.map((k, i) => ({ key: k, label: fmtMonth(k), value: sums.get(k) ?? 0, partial: i === keys.length - 1 }))}
      />
    </WidgetFrame>
  );
}

/** Open rows per status, in pipeline order (MO-508). */
export function FunnelWidget(props: WidgetProps) {
  const w = useWidget(props);
  const { meta, rows } = w;
  const drill = useDrill(w, props);
  const st = meta.status;
  if (!st) return <WidgetFrame w={w} widget={props}>{null}</WidgetFrame>;
  const agg = aggregate(rows.filter((r) => isOpen(meta, r)), { groupBy: [st.col], measures: meta.money ? [{ fn: 'count' }, { fn: 'sum', column: meta.money.col }] : [{ fn: 'count' }], order: { [st.col]: st.open } });
  return (
    <WidgetFrame w={w} widget={props}>
      <Funnel title={meta.spec.title} onSelect={(key, el) => drill(st.labels[key] ?? key, rows.filter((r) => isOpen(meta, r) && String(r[st.col]) === key), el)} steps={agg.groups.map((g) => ({ key: g.key, label: st.labels[g.key] ?? g.key, count: g.count, value: meta.money ? w.fmt(g.values[`sum_${meta.money.col}`] ?? 0) : '' }))} />
    </WidgetFrame>
  );
}

/** Single number tiles: open value, open count, stuck (MO-506). Each opens the records behind it. */
export function KpiWidget(props: WidgetProps) {
  const w = useWidget(props);
  const { meta, rows, t } = w;
  const drill = useDrill(w, props);
  const open = rows.filter((r) => isOpen(meta, r));
  const stuck = open.filter((r) => isStuck(meta, r));
  const sum = (l: typeof rows) => (meta.money ? l.reduce((s, r) => s + Number(r[meta.money!.col] ?? 0), 0) : l.length);
  const main = meta.days && props.widget.title ? stuck : open;
  const tiles: { label: string; value: string; tone?: 'bad'; rows: typeof rows }[] = [{ label: props.widget.title ?? t('kpi.openCount'), value: `${main.length}`, rows: main }];
  if (meta.money) tiles.push({ label: t('kpi.openValue'), value: formatMoney(sum(main), meta.money.currency), rows: main });
  if (meta.days && !props.widget.title) tiles.push({ label: t('kpi.stuck', { days: meta.stuckDays }), value: String(stuck.length), tone: 'bad', rows: stuck });
  return (
    <WidgetFrame w={w} widget={props} foot={false}>
      <div className="morph-kpis">
        {tiles.map((k) => (
          <button key={k.label} type="button" className="morph-kpi drill" aria-label={t('kpi.drill', { label: k.label, value: k.value })} onClick={(e) => drill(k.label, k.rows, e.currentTarget)}>
            <div className="label">{k.label}<span className="go" aria-hidden="true">›</span></div>
            <div className="value morph-num" style={k.tone === 'bad' && k.value !== '0' ? { color: 'var(--morph-bad)' } : undefined}>{k.value}</div>
          </button>
        ))}
      </div>
      <span className="morph-sr">{t('kpi.count', { count: open.length, noun: nounFor(meta.noun, open.length) })}</span>
    </WidgetFrame>
  );
}

/** Workload is the balancer's read-only view. */
export function WorkloadWidget(props: WidgetProps) {
  return <Balancer {...props} view="report" />;
}
