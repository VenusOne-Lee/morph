import { useEffect, useRef, useState } from 'react';
import { isOpen, isStuck, nextStage, rowName, terminalPair } from '../meta.js';
import { leastLoaded } from '../helpers.js';
import { Histogram } from '../charts/index.js';
import type { WidgetProps } from '../registry.js';
import { useWidget, WidgetFrame } from './frame.js';

/** Stuck queue (MO-603): one stuck row at a time, oldest first, with the three likely fixes. */
export function Queue(props: WidgetProps) {
  const w = useWidget(props);
  const { meta, rows, t, m } = w;
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [hist, setHist] = useState<number | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const open = rows.filter((r) => isOpen(meta, r));
  const stuck = open.filter((r) => isStuck(meta, r)).sort((a, b) => Number(b[meta.days!.col]) - Number(a[meta.days!.col]));
  const queue = stuck.filter((r) => !skipped.has(String(r[meta.idCol])));
  const current = queue[0];
  const currentId = current ? String(current[meta.idCol]) : null;
  const acting = w.view !== 'report' && w.canAct;

  // Move focus to the next card after an action so keyboard users keep their place.
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (acting && prev.current && prev.current !== currentId) headRef.current?.focus();
    prev.current = currentId;
  }, [currentId, acting]);

  const limit = meta.stuckDays;
  const share = t('queue.share', { stuck: stuck.length, total: open.length, limit });

  const histogram = meta.days ? (() => {
    const edges = [7, limit, limit * 2, limit * 4].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    const labels = edges.map((e, i) => `${i === 0 ? 0 : edges[i - 1]! + 1}–${e}`).concat(`${edges[edges.length - 1]! + 1}+`);
    const counts = labels.map(() => 0);
    for (const r of open) {
      const d = Number(r[meta.days!.col]);
      const i = edges.findIndex((e) => d <= e);
      counts[i === -1 ? edges.length : i]! += 1;
    }
    return <Histogram title={meta.spec.title} active={hist} onSelect={setHist} buckets={labels.map((l, i) => ({ label: l, count: counts[i]!, late: i > 0 && (edges[i - 1] ?? 0) >= limit }))} />;
  })() : null;

  if (!meta.days) return <WidgetFrame w={w} widget={props}>{null}</WidgetFrame>;

  if (!acting) {
    return (
      <WidgetFrame w={w} widget={props}>
        <p className="morph-muted" style={{ margin: '0 0 10px' }}>{share}</p>
        {histogram}
      </WidgetFrame>
    );
  }

  const next = current && meta.status ? nextStage(meta, String(current[meta.status.col])) : null;
  const nextOpen = next && meta.status && !meta.status.terminal.includes(next) ? next : null;
  const lose = terminalPair(meta).lose;
  const to = current && w.owners && meta.owner ? leastLoaded(meta, rows, w.owners, String(current[meta.owner.rawCol])) : null;
  const preview = (actionId: string, target: string, el: HTMLElement) => m.openPreview({ actionId, ids: [currentId!], to: target, reportId: props.report, returnFocus: el });
  const days = current ? Number(current[meta.days.col]) : 0;
  const label = (v: string) => meta.status?.labels[v] ?? v;

  return (
    <WidgetFrame w={w} widget={props}>
      {w.view === 'combined' && (
        <>
          <p className="morph-muted" style={{ margin: '0 0 10px' }}>{share}</p>
          {histogram}
        </>
      )}
      {current ? (
        <div className="morph-qcard" aria-live="polite">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <h4 ref={headRef} tabIndex={-1} style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{rowName(meta, current)}</h4>
            <span className="morph-badge morph-num">{t('queue.counter', { n: stuck.length - queue.length + 1, total: stuck.length })}</span>
          </div>
          <div className="morph-muted morph-num" style={{ fontSize: 13 }}>
            {[meta.money ? w.fmt(Number(current[meta.money.col] ?? 0)) : null, meta.owner?.col ? String(current[meta.owner.col] ?? '') : null].filter(Boolean).join(' · ')}
          </div>
          <div className="why">{t('queue.why', { stage: meta.status ? label(String(current[meta.status.col])) : '', days, over: days - limit, limit })}</div>
          <div className="morph-qactions">
            {w.allowed.stage && nextOpen && <button type="button" className="morph-btn primary" onClick={(e) => preview(w.allowed.stage!.id, nextOpen, e.currentTarget)}>{t('queue.advance', { stage: label(nextOpen) })}</button>}
            {w.allowed.owner && to && <button type="button" className="morph-btn" onClick={(e) => preview(w.allowed.owner!.id, to.id, e.currentTarget)}>{t('queue.reassign', { owner: to.name })}</button>}
            {w.allowed.stage && lose && <button type="button" className="morph-btn" onClick={(e) => preview(w.allowed.stage!.id, lose, e.currentTarget)}>{t('queue.close', { stage: label(lose) })}</button>}
            <button type="button" className="morph-btn ghost" onClick={() => setSkipped((s) => new Set(s).add(currentId!))}>{t('queue.skip')}</button>
          </div>
        </div>
      ) : (
        <div className="morph-state">
          <div>{t('queue.clear')}</div>
          {skipped.size > 0 && <button type="button" className="morph-btn" onClick={() => setSkipped(new Set())}>{t('queue.bringBack', { count: skipped.size })}</button>}
        </div>
      )}
    </WidgetFrame>
  );
}
