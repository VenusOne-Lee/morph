import { Fragment, useId, useMemo, useState } from 'react';
import { aggregate, formatMoney, formatValue, sortRows, type RuntimeFilter, type WidgetView } from '@morph-reports/spec';
import { useMorph, useReport } from './context.js';
import { isOpen, isStuck, nextStage, rowName, type ReportMeta, type Row } from './meta.js';
import { Panel, Segmented, Skeleton, StateMessage } from './components/primitives.js';
import { StackedBars } from './charts/index.js';
import { nounFor } from './components/PreviewModal.js';
import { getWidget } from './registry.js';
import { describeSource, leastLoaded, useAllowedActions } from './helpers.js';

export { describeSource, leastLoaded, useAllowedActions };
import { SpecPanel } from './components/SpecPanel.js';

export interface MorphReportProps {
  report: string;
  /** Override the widgets' default view. */
  view?: WidgetView;
  /** false hides all actions; a list allows only those action ids. */
  actions?: boolean | string[];
  filters?: RuntimeFilter[];
  onRowClick?: (row: Row) => void;
  className?: string;
  height?: number | string;
  /** Show the `{ }` spec toggle (dev mode only by default). */
  showSpec?: boolean;
}

/** `<MorphReport>` (MO-501 – MO-505, MO-405, MO-406, MO-409, MO-410). */
export function MorphReport(props: MorphReportProps) {
  const m = useMorph();
  const { t } = m;
  const { status, rows, capped, error, meta, refetch } = useReport(props.report, props.filters);
  const titleId = useId();
  const groupChoices = useMemo(() => {
    const list = [...(meta.spec.groupBy?.slice(0, 1) ?? []), ...(meta.spec.groupByOptions ?? [])];
    return list.map((ref) => meta.resolved.column(ref)).filter((c): c is NonNullable<typeof c> => !!c && !(c.derived && 'days_since' in c.derived));
  }, [meta]);
  const [groupAlias, setGroupAlias] = useState<string | null>(groupChoices[0]?.alias ?? null);
  const [only, setOnly] = useState<'all' | 'stuck'>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSpec, setShowSpec] = useState(false);
  const allowed = useAllowedActions(meta, props.actions);
  const ownerOpts = meta.owner?.action?.target ? m.owners(meta.owner.action.target.entity, meta.owner.action.target.field, meta.owner.action.target.display) : null;

  if (meta.spec.broken) return <Panel title={meta.spec.title}><StateMessage tone="error" title={t('report.broken', { reason: meta.spec.broken.reason })} /></Panel>;

  // Widgets other than table/bar render through the registry (kanban, queue...).
  const ACT = ['kanban', 'balancer', 'queue', 'kpi-fix'];
  const special = meta.spec.widgets.find((w) => ACT.includes(w.type)) ?? meta.spec.widgets.find((w) => !['table', 'bar', 'kpi'].includes(w.type));
  const onlyTableLike = meta.spec.widgets.every((w) => ['table', 'bar', 'kpi'].includes(w.type));

  const money = meta.money;
  const fmt = (n: number) => (money ? formatMoney(n, money.currency) : String(Math.round(n)));
  const base = only === 'stuck' ? rows.filter((r) => isStuck(meta, r)) : rows;
  const groupCol = groupAlias;
  const enumOrder = groupCol && meta.status?.col === groupCol ? meta.status.values : undefined;
  const labelOf = (key: string) => (groupCol && meta.status?.col === groupCol ? (meta.status.labels[key] ?? key) : key);
  const measures = money ? [{ fn: 'count' as const }, { fn: 'sum' as const, column: money.col }] : [{ fn: 'count' as const }];
  const agg = aggregate(base, { ...(groupCol ? { groupBy: [groupCol] } : {}), measures, ...(enumOrder ? { order: { [groupCol!]: enumOrder.filter((v) => base.some((r) => r[groupCol!] === v) || !meta.status!.terminal.includes(v)) } } : {}) });
  const shown = picked && groupCol ? base.filter((r) => String(r[groupCol] ?? '(none)') === picked) : base;
  const sort = meta.spec.sort?.map((s) => ({ field: meta.resolved.column(s.field)?.alias ?? s.field, dir: s.dir })) ?? [];
  const bars = agg.groups.map((g) => {
    const stuckRows = g.rows.filter((r) => isStuck(meta, r));
    const stuckVal = money ? stuckRows.reduce((s, r) => s + Number(r[money.col] ?? 0), 0) : stuckRows.length;
    const total = money ? (g.values[`sum_${money.col}`] ?? 0) : g.count;
    return {
      key: g.key,
      label: labelOf(g.key),
      sub: `${t('report.groupCount', { count: g.count, noun: nounFor(meta.noun, g.count) })}${meta.days ? ` · ${t('report.stuckLabel', { value: fmt(stuckVal) })}` : ''}`,
      a: total - stuckVal,
      b: meta.days ? stuckVal : 0,
      ariaLabel: t('report.barLabel', { group: labelOf(g.key), count: g.count, noun: nounFor(meta.noun, g.count), value: fmt(total), stuck: fmt(stuckVal) }),
    };
  });

  const visibleCols = meta.resolved.columns.filter((c) => !c.hidden && c.alias !== groupCol && c.alias !== meta.displayCol && !(c.derived && 'days_since' in c.derived) && c.alias !== meta.status?.col);
  const hasActs = !!(allowed.stage || allowed.owner);
  const bulkMax = Math.min(allowed.stage?.bulkMax ?? 25, allowed.owner?.bulkMax ?? 25);
  const shownIds = shown.map((r) => String(r[meta.idCol]));
  const allSel = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const chips: { label: string; clear(): void }[] = [];
  if (picked) chips.push({ label: `${groupChoices.find((g) => g.alias === groupCol)?.label ?? ''}: ${labelOf(picked)}`, clear: () => setPicked(null) });
  if (only === 'stuck') chips.push({ label: t('report.showStuck'), clear: () => setOnly('all') });

  const controls = (
    <>
      {groupChoices.length > 1 && (
        <Segmented label={t('report.group')} value={groupAlias ?? ''} options={groupChoices.map((c) => ({ value: c.alias, label: c.label }))} onChange={(v) => { setGroupAlias(v); setPicked(null); }} />
      )}
      {meta.days && <Segmented<'all' | 'stuck'> label={t('report.show')} value={only} options={[{ value: 'all', label: t('report.showAll') }, { value: 'stuck', label: t('report.showStuck') }]} onChange={setOnly} />}
      {(props.showSpec ?? m.dev) && (
        <button type="button" className="morph-btn sm ghost morph-mono" aria-pressed={showSpec} onClick={() => setShowSpec((s) => !s)}>
          {'{ }'}
        </button>
      )}
    </>
  );

  const openPreview = (actionId: string, ids: string[], to?: string, el?: HTMLElement | null) => m.openPreview({ actionId, ids, ...(to ? { to } : {}), reportId: props.report, returnFocus: el ?? null });

  return (
    <Panel title={meta.spec.title} labelledBy={titleId} src={describeSource(meta)} controls={controls} className={props.className} style={props.height ? { maxHeight: props.height, overflow: 'auto' } : undefined}>
      {showSpec && <SpecPanel spec={meta.spec} />}
      {status === 'loading' || status === 'idle' ? (
        <Skeleton label={t('report.loading')} />
      ) : status === 'error' && error ? (
        <StateMessage tone="error" title={error.message} hint={error.hint} action={<button type="button" className="morph-btn" onClick={() => void refetch()}>{t('report.retry')}</button>} />
      ) : (
        <>
          {capped && <div className="morph-alert warn" style={{ margin: '12px 18px 0' }}>{t('report.capped', { cap: m.config.rowCap.toLocaleString('en-ZA').replace(/\s/g, ',') })}</div>}
          {!onlyTableLike && special && (() => {
            const W = getWidget(special.type);
            return W ? <div className="morph-panel-body"><W report={props.report} widget={special} view={props.view} actions={props.actions} embedded /></div> : null;
          })()}
          <div className="morph-panel-body">
            <div className="morph-chips">
              <span>{t('report.shown', { shown: shown.length, total: rows.length, noun: meta.noun })}</span>
              {chips.map((c) => (
                <span key={c.label} className="morph-chip">
                  {c.label}
                  <button type="button" aria-label={t('report.removeFilter', { label: c.label })} onClick={c.clear}>×</button>
                </span>
              ))}
            </div>
            {rows.length > 0 && groupCol && meta.spec.widgets.some((w) => w.type === 'bar' || w.type === 'kanban' || w.type === 'table' || w.type === 'kpi') && (
              <>
                <StackedBars bars={bars} format={fmt} active={picked} onSelect={setPicked} title={meta.spec.title} />
                {meta.days && (
                  <div className="morph-legend">
                    <span><i style={{ background: 'var(--morph-accent)' }} />{t('report.legendMoving', { days: meta.stuckDays, status: meta.status?.col ?? 'stage' })}</span>
                    <span><i style={{ background: 'var(--morph-bad)' }} />{t('report.legendStuck', { days: meta.stuckDays })}</span>
                    <span>{t('report.legendClick')}</span>
                  </div>
                )}
              </>
            )}
          </div>
          {rows.length === 0 ? (
            <StateMessage title={props.filters?.length ? t('report.emptyFiltered') : t('report.empty')} hint={t('error.noRows')} />
          ) : (
            <div className="morph-table-wrap">
              <table className="morph-table">
                <thead>
                  <tr>
                    {hasActs && (
                      <th style={{ width: 40 }}>
                        <input type="checkbox" aria-label={t('report.selectAll')} checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(shownIds.slice(0, bulkMax)))} />
                      </th>
                    )}
                    <th scope="col">{meta.displayCol ? (meta.resolved.column(meta.displayCol)?.label ?? '') : ''}</th>
                    {visibleCols.map((c) => (
                      <th key={c.alias} scope="col" className={['money', 'count', 'number'].includes(c.semantic) ? 'num' : undefined}>{c.label}</th>
                    ))}
                    {meta.days && <th scope="col" className="num">{meta.resolved.column(meta.days.col)?.label}</th>}
                    {hasActs && <th scope="col" className="num">{t('report.act')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {(groupCol ? agg.groups.filter((g) => !picked || g.key === picked) : [{ key: '', rows: shown, count: shown.length, values: agg.totals }]).map((g) => {
                    if (!g.rows.length) return null;
                    const sorted = sortRows(g.rows, sort);
                    return (
                      <Fragment key={g.key || '_all'}>
                        {groupCol && (
                          <tr className="group">
                            {hasActs && <td />}
                            <td colSpan={1 + visibleCols.filter((c) => c.semantic !== 'money').length}>
                              {labelOf(g.key)} <span>· {t('report.groupCount', { count: g.count, noun: nounFor(meta.noun, g.count) })}</span>
                            </td>
                            {money && visibleCols.some((c) => c.alias === money.col) && <td className="num">{fmt(g.values[`sum_${money.col}`] ?? 0)}</td>}
                            {meta.days && <td />}
                            {hasActs && <td />}
                          </tr>
                        )}
                        {sorted.map((r) => {
                          const id = String(r[meta.idCol]);
                          const fl = m.flash.get(id);
                          const days = meta.days ? Number(r[meta.days.col]) : null;
                          const late = days !== null && isOpen(meta, r) && days > meta.stuckDays;
                          const next = meta.status ? nextStage(meta, String(r[meta.status.col])) : null;
                          const ll = ownerOpts ? leastLoaded(meta, rows, ownerOpts, String(r[meta.owner!.rawCol])) : null;
                          return (
                            <tr
                              key={id}
                              className={`${selected.has(id) ? 'sel ' : ''}${fl ? `morph-flash-${fl} ` : ''}${props.onRowClick ? 'clickable' : ''}`}
                              onClick={(e) => {
                                if (props.onRowClick && !(e.target as HTMLElement).closest('button,input,a')) props.onRowClick(r);
                              }}
                            >
                              {hasActs && (
                                <td>
                                  <input type="checkbox" aria-label={t('report.selectRow', { name: rowName(meta, r) })} checked={selected.has(id)} disabled={!selected.has(id) && selected.size >= bulkMax} onChange={() => toggle(id)} />
                                </td>
                              )}
                              <td>
                                <span style={{ fontWeight: 500 }}>{rowName(meta, r)}</span>
                                {meta.status && groupCol !== meta.status.col && <div className="sub">{meta.status.labels[String(r[meta.status.col])] ?? String(r[meta.status.col])}</div>}
                              </td>
                              {visibleCols.map((c) => (
                                <td key={c.alias} className={['money', 'count', 'number'].includes(c.semantic) ? 'num' : undefined}>
                                  {c.semantic === 'status_enum' && c.enumId ? (m.project.model.enums[c.enumId]?.labels[String(r[c.alias])] ?? String(r[c.alias] ?? '—')) : formatValue(r[c.alias], c.semantic, c.currency)}
                                </td>
                              ))}
                              {meta.days && (
                                <td className="num">
                                  <span className={`morph-age${late ? ' late' : ''}`}>
                                    <span className="track" aria-hidden="true"><span className="fill" style={{ width: `${Math.min(100, ((days ?? 0) / Math.max(meta.stuckDays * 2.5, 1)) * 100)}%` }} /></span>
                                    <b>{days ?? '—'}</b>
                                  </span>
                                </td>
                              )}
                              {hasActs && (
                                <td>
                                  <span className="morph-rowacts">
                                    {allowed.stage && next && isOpen(meta, r) && (
                                      <button type="button" className="morph-btn sm" onClick={(e) => openPreview(allowed.stage!.id, [id], next, e.currentTarget)}>{t('report.move')}</button>
                                    )}
                                    {allowed.owner && (
                                      <button type="button" className="morph-btn sm ghost" style={{ borderColor: 'var(--morph-line)' }} onClick={(e) => openPreview(allowed.owner!.id, [id], ll?.id, e.currentTarget)}>{t('report.reassign')}</button>
                                    )}
                                  </span>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  <tr className="total">
                    {hasActs && <td />}
                    <td colSpan={1 + visibleCols.filter((c) => c.semantic !== 'money').length}>{t('report.total', { count: shown.length, noun: nounFor(meta.noun, shown.length) })}</td>
                    {money && visibleCols.some((c) => c.alias === money.col) && <td className="num">{fmt(shown.reduce((s, r) => s + Number(r[money.col] ?? 0), 0))}</td>}
                    {meta.days && <td />}
                    {hasActs && <td />}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {hasActs && selected.size > 0 && <BulkBar meta={meta} rows={rows} selected={[...selected]} allowed={allowed} bulkMax={bulkMax} onClear={() => setSelected(new Set())} onPreview={(a, to, el) => openPreview(a, [...selected], to, el)} />}
        </>
      )}
    </Panel>
  );
}

function BulkBar(props: { meta: ReportMeta; rows: Row[]; selected: string[]; allowed: ReturnType<typeof useAllowedActions>; bulkMax: number; onClear(): void; onPreview(action: string, to: string, el: HTMLElement): void }) {
  const m = useMorph();
  const { t } = m;
  const { meta } = props;
  const owners = meta.owner?.action?.target ? m.owners(meta.owner.action.target.entity, meta.owner.action.target.field, meta.owner.action.target.display) : null;
  const [stage, setStage] = useState(meta.status?.values.find((v) => !meta.status!.terminal.includes(v)) ?? '');
  const [owner, setOwner] = useState('');
  const money = meta.money;
  const sum = money ? props.rows.filter((r) => props.selected.includes(String(r[meta.idCol]))).reduce((s, r) => s + Number(r[money.col] ?? 0), 0) : 0;
  const over = props.selected.length > props.bulkMax;
  return (
    <div className="morph-bulk" role="region" aria-label={t('bulk.selected', { count: props.selected.length })}>
      <b>{t('bulk.selected', { count: props.selected.length })}{money ? ` · ${formatMoney(sum, money.currency)}` : ''}</b>
      {over && <span className="note">{t('bulk.limit', { max: props.bulkMax })}</span>}
      {props.allowed.stage && meta.status && (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <label className="note" htmlFor="morph-bulk-stage">{t('bulk.moveTo')}</label>
          <select id="morph-bulk-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            {meta.status.values.map((v) => <option key={v} value={v}>{meta.status!.labels[v] ?? v}</option>)}
          </select>
          <button type="button" className="morph-btn sm primary" disabled={over} onClick={(e) => props.onPreview(props.allowed.stage!.id, stage, e.currentTarget)}>{t('bulk.preview')}</button>
        </span>
      )}
      {props.allowed.owner && owners && (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <label className="note" htmlFor="morph-bulk-owner">{t('bulk.reassignTo')}</label>
          <select id="morph-bulk-owner" value={owner || owners[0]?.id || ''} onChange={(e) => setOwner(e.target.value)}>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button type="button" className="morph-btn sm primary" disabled={over} onClick={(e) => props.onPreview(props.allowed.owner!.id, owner || owners[0]!.id, e.currentTarget)}>{t('bulk.preview')}</button>
        </span>
      )}
      <button type="button" className="morph-btn sm" onClick={props.onClear}>{t('bulk.clear')}</button>
    </div>
  );
}
