import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatMoney, formatValue, listAudit, type AuditEntry, type RuntimeFilter } from '@morph-reports/spec';
import { useMorph, useReport } from '../context.js';
import { isOpen, isStuck, nextStage, rowName, type ReportMeta, type Row } from '../meta.js';
import { leastLoaded, useAllowedActions } from '../helpers.js';
import { initials, Skeleton, StateMessage } from '../components/primitives.js';
import { nounFor } from '../components/PreviewModal.js';

/**
 * A drill-down: the records behind a number, bar or cell, and from there one record.
 * Ids are fixed when the drill opens, so the list stays put while actions change values.
 */
export interface DrillRequest {
  reportId: string;
  /** What was clicked, in plain words: "Stuck over 14 days", "Proposal". */
  title: string;
  /** Rows in the list, in order. Leave out to list every row of the report. */
  ids?: string[];
  /** Open straight on this record. */
  recordId?: string;
  /** The runtime filters of the report the click came from, so the same cached rows are used. */
  filters?: RuntimeFilter[];
  /** false hides actions; a list allows only those action ids. */
  actions?: boolean | string[] | undefined;
  returnFocus?: HTMLElement | null;
}

/** Builds a link to the builder's own record page, if they have one. */
export type RecordHref = (row: Row, ctx: { reportId: string; table: string; id: string }) => string | null | undefined;

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Ids of rows matching a predicate, for opening a drill from widget code. */
export function idsWhere(meta: ReportMeta, rows: Row[], pred: (r: Row) => boolean): string[] {
  return rows.filter(pred).map((r) => String(r[meta.idCol]));
}

/** The side sheet: a list of records, then one record. Rendered once by the provider. */
export function DrillPanel(props: { request: DrillRequest; onClose(): void; paused: boolean; recordHref?: RecordHref | undefined }) {
  const m = useMorph();
  const { t } = m;
  const req = props.request;
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const { status, rows, meta, error, refetch } = useReport(req.reportId, req.filters ?? []);
  const [recordId, setRecordId] = useState<string | null>(req.recordId ?? null);
  const listFocus = useRef<string | null>(null);
  const returnTo = useRef<HTMLElement | null>(req.returnFocus ?? (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null));

  // A new drill replaces the old one.
  useEffect(() => setRecordId(req.recordId ?? null), [req]);

  // The order is fixed once rows are in, so acting on a record doesn't reshuffle the list under you.
  const [order, setOrder] = useState<{ req: DrillRequest; ids: string[] } | null>(null);
  useEffect(() => {
    if (status !== 'ready' || order?.req === req) return;
    let next = req.ids ?? rows.map((r) => String(r[meta.idCol]));
    if (!(req.ids && req.recordId) && meta.days) {
      // Lists opened from a number or a mark: oldest first, the ones most likely to need a hand.
      const age = new Map(rows.map((r) => [String(r[meta.idCol]), Number(r[meta.days!.col] ?? 0)]));
      next = [...next].sort((a, b) => (age.get(b) ?? 0) - (age.get(a) ?? 0));
    }
    setOrder({ req, ids: next });
  }, [status, req, rows, meta, order]);
  const ids = order?.req === req ? order.ids : (req.ids ?? []);
  const byId = useMemo(() => new Map(rows.map((r) => [String(r[meta.idCol]), r])), [rows, meta.idCol]);
  const listRows = ids.map((id) => byId.get(id)).filter((r): r is Row => !!r);
  // Only a list drill has a "back"; a drill opened on one record from a table row is just that record.
  const hasList = !req.recordId || !!req.ids;

  const close = useCallback(() => {
    props.onClose();
    setTimeout(() => returnTo.current?.focus?.(), 0);
  }, [props]);

  const back = useCallback(() => {
    listFocus.current = recordId;
    setRecordId(null);
  }, [recordId]);

  // Focus: the heading on open and on every view change, the row you came from on back.
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    if (!recordId && listFocus.current) {
      const want = listFocus.current;
      const btn = [...el.querySelectorAll<HTMLElement>('[data-drill-id]')].find((b) => b.dataset.drillId === want);
      listFocus.current = null;
      if (btn) return void btn.focus();
    }
    el.querySelector<HTMLElement>('[data-drill-head]')?.focus();
  }, [recordId]);

  useEffect(() => {
    if (props.paused) return;
    const onKey = (e: KeyboardEvent) => {
      const el = sheet.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (recordId && hasList) back();
        else close();
        return;
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.paused, recordId, hasList, back, close]);

  const pos = recordId ? ids.indexOf(recordId) : -1;
  const go = (d: number) => {
    const next = ids[pos + d];
    if (next) setRecordId(next);
  };

  const money = meta.money;
  const total = money ? listRows.reduce((s, r) => s + Number(r[money.col] ?? 0), 0) : 0;

  let body: ReactNode;
  if (status === 'loading' || status === 'idle') body = <Skeleton label={t('report.loading')} chart={false} rows={6} />;
  else if (status === 'error' && error) body = <StateMessage tone="error" title={error.message} hint={error.hint} action={<button type="button" className="morph-btn" onClick={() => void refetch()}>{t('report.retry')}</button>} />;
  else if (recordId) body = <RecordBody meta={meta} reportId={req.reportId} row={byId.get(recordId) ?? null} rows={rows} actions={req.actions} recordHref={props.recordHref} />;
  else body = <RecordList meta={meta} rows={listRows} onOpen={setRecordId} />;

  return (
    <div className="morph-drill-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="morph-drill" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={sheet} data-view={recordId ? 'record' : 'list'}>
        <header className="morph-drill-head">
          <div className="morph-drill-nav">
            {recordId && hasList ? (
              <button type="button" className="morph-btn sm ghost morph-drill-back" onClick={back}>
                <span aria-hidden="true">←</span> {t('drill.back', { title: req.title })}
              </button>
            ) : (
              <span className="morph-eyebrow" style={{ margin: 0 }}>{meta.spec.title}</span>
            )}
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {recordId && hasList && ids.length > 1 && pos >= 0 && (
                <>
                  <span className="morph-muted morph-num" style={{ fontSize: 12.5, marginRight: 4 }}>{t('drill.position', { n: pos + 1, total: ids.length })}</span>
                  <button type="button" className="morph-btn sm" aria-label={t('drill.prev')} disabled={pos <= 0} onClick={() => go(-1)}>↑</button>
                  <button type="button" className="morph-btn sm" aria-label={t('drill.next')} disabled={pos >= ids.length - 1} onClick={() => go(1)}>↓</button>
                </>
              )}
              <button type="button" className="morph-btn sm ghost" aria-label={t('drill.close')} onClick={close}>✕</button>
            </span>
          </div>
          {recordId ? (
            <RecordHeading id={titleId} meta={meta} row={byId.get(recordId) ?? null} />
          ) : (
            <div>
              <h2 id={titleId} className="morph-drill-title" tabIndex={-1} data-drill-head>{req.title}</h2>
              {status === 'ready' && (
                <div className="morph-drill-sub morph-num">
                  {t('drill.count', { count: listRows.length, noun: nounFor(meta.noun, listRows.length) })}
                  {money ? ` · ${formatMoney(total, money.currency)}` : ''}
                </div>
              )}
            </div>
          )}
        </header>
        <div className="morph-drill-body">{body}</div>
        <footer className="morph-drill-foot morph-mono">{t('drill.source', { table: meta.spec.source, name: m.viewer.name ?? m.viewer.id ?? '—' })}</footer>
      </div>
    </div>
  );
}

function statusTone(meta: ReportMeta, row: Row): string {
  if (!meta.status) return '';
  const v = String(row[meta.status.col]);
  if (!meta.status.terminal.includes(v)) return isStuck(meta, row) ? ' bad' : ' accent';
  return /won|done|complete|resolved|solved|paid|delivered|shipped/i.test(v) ? ' good' : '';
}

function RecordHeading(props: { id: string; meta: ReportMeta; row: Row | null }) {
  const { meta, row } = props;
  const m = useMorph();
  return (
    <div>
      <h2 id={props.id} className="morph-drill-title" tabIndex={-1} data-drill-head>{row ? rowName(meta, row) : nounFor(meta.noun, 1)}</h2>
      {row && (
        <div className="morph-drill-tags">
          {meta.status && (
            <span className={`morph-badge${statusTone(meta, row)}`}>
              <span className="dot" />
              {meta.status.labels[String(row[meta.status.col])] ?? String(row[meta.status.col])}
            </span>
          )}
          {isStuck(meta, row) && <span className="morph-badge bad">{m.t('drill.stuck')}</span>}
          {meta.owner?.col && row[meta.owner.col] != null && (
            <span className="morph-drill-owner">
              <span className="morph-avatar" aria-hidden="true">{initials(String(row[meta.owner.col]))}</span>
              {String(row[meta.owner.col])}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** The list level: one row per record, every row a button into the record. */
function RecordList(props: { meta: ReportMeta; rows: Row[]; onOpen(id: string): void }) {
  const { meta, rows } = props;
  const m = useMorph();
  const { t } = m;
  if (!rows.length) return <StateMessage title={t('drill.empty')} />;
  const max = Math.max(meta.stuckDays * 2.5, 1);
  return (
    <ul className="morph-drill-list" aria-label={t('drill.hint')}>
      {rows.map((r) => {
        const id = String(r[meta.idCol]);
        const days = meta.days ? Number(r[meta.days.col]) : null;
        const late = days !== null && isOpen(meta, r) && days > meta.stuckDays;
        const fl = m.flash.get(id);
        return (
          <li key={id} className={fl ? `morph-flash-${fl}` : undefined}>
            <button type="button" className="morph-drill-row" data-drill-id={id} onClick={() => props.onOpen(id)}>
              <span className="name">
                <b>{rowName(meta, r)}</b>
                <span className="sub">
                  {[meta.status ? (meta.status.labels[String(r[meta.status.col])] ?? String(r[meta.status.col])) : null, meta.owner?.col ? (r[meta.owner.col] as string | null) : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              {meta.money && <span className="morph-num val">{formatMoney(Number(r[meta.money.col] ?? 0), meta.money.currency)}</span>}
              {meta.days && (
                <span className={`morph-age${late ? ' late' : ''}`}>
                  <span className="track" aria-hidden="true"><span className="fill" style={{ width: `${Math.min(100, ((days ?? 0) / max) * 100)}%` }} /></span>
                  <b>{days ?? '—'}</b>
                </span>
              )}
              <span className="chev" aria-hidden="true">›</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The record level, used by the drill sheet and by `<MorphRecord>`. */
export function RecordBody(props: { meta: ReportMeta; reportId: string; row: Row | null; rows: Row[]; actions?: boolean | string[] | undefined; recordHref?: RecordHref | undefined }) {
  const { meta, row } = props;
  const m = useMorph();
  const { t } = m;
  if (!row) return <StateMessage title={t('drill.gone')} hint={t('drill.goneHint')} />;
  const id = String(row[meta.idCol]);
  const days = meta.days ? Number(row[meta.days.col]) : null;
  const late = days !== null && isOpen(meta, row) && days > meta.stuckDays;
  const href = props.recordHref?.(row, { reportId: props.reportId, table: meta.spec.source, id }) ?? null;
  const skip = new Set([meta.displayCol, meta.status?.col, meta.owner?.col, meta.money?.col, meta.days?.col]);
  const details = meta.resolved.columns.filter((c) => !c.hidden && !skip.has(c.alias));
  const fl = m.flash.get(id);

  return (
    <div className={`morph-record${fl ? ` morph-flash-${fl}` : ''}`}>
      {(meta.money || meta.days) && (
        <div className="morph-record-stats">
          {meta.money && (
            <div>
              <div className="label">{(meta.resolved.column(meta.money.col)?.label ?? '').replace(new RegExp(`\\s+${meta.money.currency ?? '$^'}$`, 'i'), '')}</div>
              <div className="value morph-num">{formatMoney(Number(row[meta.money.col] ?? 0), meta.money.currency)}</div>
            </div>
          )}
          {meta.days && (
            <div>
              <div className="label">{meta.resolved.column(meta.days.col)?.label}</div>
              <div className={`value morph-num${late ? ' bad' : ''}`}>{days ?? '—'}</div>
              <div className={`morph-age${late ? ' late' : ''}`} style={{ justifyContent: 'flex-start', marginTop: 4 }}>
                <span className="track" aria-hidden="true" style={{ width: '100%' }}>
                  <span className="fill" style={{ width: `${Math.min(100, ((days ?? 0) / Math.max(meta.stuckDays * 2.5, 1)) * 100)}%` }} />
                </span>
              </div>
              {meta.status && <div className="morph-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('drill.daysIn', { days: days ?? '—', status: meta.status.labels[String(row[meta.status.col])] ?? String(row[meta.status.col]) })}</div>}
            </div>
          )}
        </div>
      )}

      <RecordActions meta={meta} reportId={props.reportId} row={row} rows={props.rows} actions={props.actions} />

      {details.length > 0 && (
        <section aria-label={t('drill.details')}>
          <h3 className="morph-record-h">{t('drill.details')}</h3>
          <dl className="morph-record-dl">
            {details.map((c) => (
              <div key={c.alias}>
                <dt>{c.label}</dt>
                <dd className={['money', 'count', 'number', 'date', 'datetime'].includes(c.semantic) ? 'morph-num' : undefined}>
                  {c.semantic === 'status_enum' && c.enumId ? (m.project.model.enums[c.enumId]?.labels[String(row[c.alias])] ?? String(row[c.alias] ?? '—')) : formatValue(row[c.alias], c.semantic, c.currency)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <RecordHistory meta={meta} id={id} />

      {href && (
        <a className="morph-btn" href={href} style={{ justifySelf: 'start', textDecoration: 'none' }}>
          {t('drill.openInApp')} <span aria-hidden="true">↗</span>
        </a>
      )}
    </div>
  );
}

function RecordActions(props: { meta: ReportMeta; reportId: string; row: Row; rows: Row[]; actions?: boolean | string[] | undefined }) {
  const { meta, row } = props;
  const m = useMorph();
  const { t } = m;
  const uid = useId();
  const allowed = useAllowedActions(meta, props.actions);
  const ownerAct = allowed.owner;
  const owners = ownerAct?.target ? m.owners(ownerAct.target.entity, ownerAct.target.field, ownerAct.target.display) : null;
  const id = String(row[meta.idCol]);
  const curStage = meta.status ? String(row[meta.status.col]) : '';
  const curOwner = meta.owner ? String(row[meta.owner.rawCol] ?? '') : '';
  const [stage, setStage] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  // Reset the picks when the record changes or its values move under us.
  useEffect(() => {
    setStage(null);
    setOwner(null);
  }, [id, curStage, curOwner]);

  if (allowed.stage === null && allowed.owner === null) {
    // Hidden, not disabled, when the viewer can't act (MO-505); say so once if the report has actions at all.
    return meta.status?.action || meta.owner?.action ? <p className="morph-muted" style={{ margin: 0, fontSize: 13 }}>{t('drill.noActs')}</p> : null;
  }
  const stageTo = stage ?? (meta.status ? (nextStage(meta, curStage) ?? meta.status.values.find((v) => v !== curStage) ?? '') : '');
  const ll = owners ? leastLoaded(meta, props.rows, owners, curOwner) : null;
  const ownerTo = owner ?? ll?.id ?? owners?.find((o) => o.id !== curOwner)?.id ?? '';
  const open = (actionId: string, to: string, el: HTMLElement) => m.openPreview({ actionId, ids: [id], to, reportId: props.reportId, returnFocus: el });

  return (
    <section className="morph-record-act" aria-label={t('drill.act', { noun: nounFor(meta.noun, 1) })}>
      <h3 className="morph-record-h">{t('drill.act', { noun: nounFor(meta.noun, 1) })}</h3>
      {allowed.stage && meta.status && (
        <div className="morph-record-actrow">
          <label htmlFor={`${uid}-stage`}>{t('drill.moveTo')}</label>
          <select id={`${uid}-stage`} className="morph-select" value={stageTo} onChange={(e) => setStage(e.target.value)}>
            {meta.status.values.map((v) => (
              <option key={v} value={v} disabled={v === curStage}>{meta.status!.labels[v] ?? v}</option>
            ))}
          </select>
          <button type="button" className="morph-btn primary" disabled={!stageTo || stageTo === curStage} onClick={(e) => open(allowed.stage!.id, stageTo, e.currentTarget)}>{t('drill.preview')}</button>
        </div>
      )}
      {ownerAct && (
        <div className="morph-record-actrow">
          <label htmlFor={`${uid}-owner`}>{t('drill.reassignTo')}</label>
          <select id={`${uid}-owner`} className="morph-select" value={ownerTo} onChange={(e) => setOwner(e.target.value)} disabled={!owners}>
            {(owners ?? []).map((o) => (
              <option key={o.id} value={o.id} disabled={o.id === curOwner}>{o.name}</option>
            ))}
          </select>
          <button type="button" className="morph-btn" disabled={!ownerTo || ownerTo === curOwner} onClick={(e) => open(ownerAct.id, ownerTo, e.currentTarget)}>{t('drill.preview')}</button>
        </div>
      )}
    </section>
  );
}

/** Morph actions on this one record, newest first, with Undo while the window is open. */
function RecordHistory(props: { meta: ReportMeta; id: string }) {
  const m = useMorph();
  const { t } = m;
  const [list, setList] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const table = props.meta.spec.source;
  const load = useCallback(() => {
    listAudit(m.client, { table, rowId: props.id, limit: 200 })
      .then((r) => {
        setList(r);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [m.client, table, props.id]);
  useEffect(load, [load, m.flash]);

  const fmtWhen = (s: string) => new Date(s).toLocaleString(m.config.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const undoDays = m.project.actions.undoDays ?? 30;

  return (
    <section aria-label={t('drill.history')}>
      <h3 className="morph-record-h">{t('drill.history')}</h3>
      {failed ? (
        <p className="morph-muted" style={{ margin: 0, fontSize: 13 }}>{t('error.generic')}</p>
      ) : !list ? (
        <div className="morph-skel" style={{ height: 40 }} />
      ) : list.length === 0 ? (
        <p className="morph-muted" style={{ margin: 0, fontSize: 13 }}>{t('drill.historyEmpty')}</p>
      ) : (
        <ol className="morph-timeline">
          {list.map((a) => {
            const def = m.project.actions.actions.find((x) => x.id === a.action);
            const entry = a.rows.find((r) => String(r.id) === props.id);
            const col = def?.column ?? '';
            const enumId = def ? m.project.model.entities[def.table]?.fields[def.column]?.enum : undefined;
            const label = (v: unknown) => {
              if (v === null || v === undefined) return '—';
              if (def?.kind === 'set_enum' && enumId) return m.project.model.enums[enumId]?.labels[String(v)] ?? String(v);
              if (def?.kind === 'set_fk' && def.target) return m.owners(def.target.entity, def.target.field, def.target.display)?.find((o) => o.id === String(v))?.name ?? String(v);
              return String(v);
            };
            const from = label(entry?.before?.[col]);
            const to = def?.kind === 'set_enum' ? label(a.to_value) : (a.to_display ?? label(a.to_value));
            const open = !a.undone_at && Date.now() - new Date(a.created_at).getTime() < undoDays * 86_400_000;
            return (
              <li key={a.id} className={a.undone_at ? 'undone' : undefined}>
                <span className="dot" aria-hidden="true" />
                <div>
                  <div>{t(def?.kind === 'set_fk' ? 'drill.historyReassign' : 'drill.historyMove', { from, to })}</div>
                  <div className="sub morph-num">
                    {fmtWhen(a.created_at)} · {a.actor_name ?? a.actor}
                    {a.source === 'mcp' ? ` · ${t('audit.via', { source: 'MCP' })}` : ''}
                    {a.row_count > 1 ? ` · ${t('drill.count', { count: a.row_count, noun: 'rows' })}` : ''}
                  </div>
                </div>
                {a.undone_at ? (
                  <span className="morph-badge">{t('audit.undone')}</span>
                ) : open ? (
                  <button type="button" className="morph-btn sm" onClick={() => void m.undo(a.id).then(load)}>{t('audit.undo')}</button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export interface MorphRecordProps {
  /** The report that defines the fields, actions and access. */
  report: string;
  /** The record's primary key. */
  id: string;
  /** false hides all actions; a list allows only those action ids. */
  actions?: boolean | string[];
  filters?: RuntimeFilter[];
  className?: string;
}

/**
 * `<MorphRecord>`: one record on a page of the builder's own, with the same details,
 * actions and history as the drill sheet. Reads through the report's view, so RLS and
 * the report's PII rules apply exactly as they do in the report.
 */
export function MorphRecord(props: MorphRecordProps) {
  const m = useMorph();
  const { status, rows, meta, error, refetch } = useReport(props.report, props.filters ?? []);
  const id = useId();
  const row = rows.find((r) => String(r[meta.idCol]) === props.id) ?? null;
  return (
    <section className={`morph-panel${props.className ? ` ${props.className}` : ''}`} aria-labelledby={id}>
      <header className="morph-panel-head" style={{ display: 'block' }}>
        <div className="morph-eyebrow">{meta.spec.title}</div>
        <RecordHeading id={id} meta={meta} row={row} />
      </header>
      <div className="morph-panel-body">
        {status === 'loading' || status === 'idle' ? (
          <Skeleton label={m.t('report.loading')} chart={false} rows={4} />
        ) : status === 'error' && error ? (
          <StateMessage tone="error" title={error.message} hint={error.hint} action={<button type="button" className="morph-btn" onClick={() => void refetch()}>{m.t('report.retry')}</button>} />
        ) : (
          <RecordBody meta={meta} reportId={props.report} row={row} rows={rows} actions={props.actions} />
        )}
      </div>
    </section>
  );
}
