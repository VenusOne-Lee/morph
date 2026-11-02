import { useState, type DragEvent } from 'react';
import { isOpen, isStuck, rowName, type Row } from '../meta.js';
import { nounFor } from '../components/PreviewModal.js';
import { StateMessage } from '../components/primitives.js';
import type { WidgetProps } from '../registry.js';
import { useAnnouncer, useWidget, WidgetFrame } from './frame.js';

/**
 * Kanban by status (MO-601). Drag a card, or click it then click "Move here" (keyboard: Tab, Enter).
 * Every move opens the preview first; nothing is written on drop.
 */
export function Kanban(props: WidgetProps) {
  const w = useWidget(props);
  const { meta, rows, t, m } = w;
  const [picked, setPicked] = useState<Row | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [live, announce] = useAnnouncer();
  const st = meta.status;
  const acting = w.view !== 'report' && !!w.allowed.stage;

  if (!st) return <WidgetFrame w={w} widget={props}><StateMessage title={t('error.generic')} /></WidgetFrame>;

  const move = (row: Row, to: string, el?: HTMLElement | null) => {
    setPicked(null);
    setOver(null);
    if (String(row[st.col]) === to || !w.allowed.stage) return;
    m.openPreview({ actionId: w.allowed.stage.id, ids: [String(row[meta.idCol])], to, reportId: props.report, returnFocus: el ?? null });
  };
  const byId = (id: string) => rows.find((r) => String(r[meta.idCol]) === id);
  const onDrop = (e: DragEvent, to: string) => {
    e.preventDefault();
    const row = byId(e.dataTransfer.getData('text/plain'));
    if (row) move(row, to, e.currentTarget as HTMLElement);
  };

  // Terminal columns only show when they hold rows, or when they are a move target.
  const cols = st.values.filter((v) => st.open.includes(v) || acting || rows.some((r) => r[st.col] === v));

  return (
    <WidgetFrame w={w} widget={props}>
      {live}
      {picked && (
        <div className="morph-alert" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span>{t('kanban.picked', { name: rowName(meta, picked) })}</span>
          <button type="button" className="morph-btn sm" onClick={() => setPicked(null)}>{t('kanban.cancelPick')}</button>
        </div>
      )}
      <div className="morph-board" role="list">
        {cols.map((v) => {
          const inCol = rows.filter((r) => r[st.col] === v);
          const sum = meta.money ? inCol.reduce((s, r) => s + Number(r[meta.money!.col] ?? 0), 0) : inCol.length;
          const stuck = inCol.filter((r) => isStuck(meta, r));
          const stuckSum = meta.money ? stuck.reduce((s, r) => s + Number(r[meta.money!.col] ?? 0), 0) : stuck.length;
          const target = acting && (over === v || (picked && picked[st.col] !== v));
          return (
            <div
              key={v}
              role="listitem"
              className={`morph-col${target ? ' target' : ''}`}
              aria-label={t('kanban.label', { stage: st.labels[v] ?? v, count: inCol.length, noun: nounFor(meta.noun, inCol.length), value: w.fmt(sum) })}
              onDragOver={acting ? (e) => { e.preventDefault(); setOver(v); } : undefined}
              onDragLeave={acting ? () => setOver((o) => (o === v ? null : o)) : undefined}
              onDrop={acting ? (e) => onDrop(e, v) : undefined}
            >
              <div className="morph-col-head">
                {st.labels[v] ?? v}
                <span className="morph-num">{inCol.length} · {w.fmt(sum)}</span>
              </div>
              {meta.days && st.open.includes(v) && sum > 0 && (
                <div className="morph-meter" title={t('kanban.stuckValue', { value: w.fmt(stuckSum) })}>
                  <i style={{ width: `${((sum - stuckSum) / sum) * 100}%`, background: 'var(--morph-accent)' }} />
                  <i style={{ width: `${(stuckSum / sum) * 100}%`, background: 'var(--morph-bad)' }} />
                </div>
              )}
              {acting && picked && picked[st.col] !== v && (
                <button type="button" className="morph-btn sm here" onClick={(e) => move(picked, v, e.currentTarget)}>{t('kanban.moveHere')}</button>
              )}
              {inCol.map((r) => {
                const id = String(r[meta.idCol]);
                const days = meta.days ? Number(r[meta.days.col]) : null;
                const late = isStuck(meta, r);
                const value = meta.money ? w.fmt(Number(r[meta.money.col] ?? 0)) : '';
                const label = t('kanban.cardLabel', { name: rowName(meta, r), value, days: days ?? '—' });
                const fl = m.flash.get(id);
                const owner = meta.owner?.col ? String(r[meta.owner.col] ?? '') : '';
                const content = (
                  <>
                    <div style={{ fontWeight: 500 }}>{rowName(meta, r)}</div>
                    <div className="meta">
                      <span>{owner}</span>
                      <span className="morph-num">
                        {value}
                        {days !== null && isOpen(meta, r) && <span className={late ? 'late' : undefined}> · {days}d</span>}
                      </span>
                    </div>
                  </>
                );
                return acting && isOpen(meta, r) ? (
                  <button
                    key={id}
                    type="button"
                    className={`morph-card${fl ? ` morph-flash-${fl}` : ''}`}
                    draggable
                    aria-pressed={picked === r}
                    aria-label={label}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setOver(null)}
                    onClick={() => {
                      const next = picked === r ? null : r;
                      setPicked(next);
                      if (next) announce(t('kanban.picked', { name: rowName(meta, r) }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setPicked(null);
                    }}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={id} className={`morph-card locked${fl ? ` morph-flash-${fl}` : ''}`} aria-label={label} role="group">
                    {content}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </WidgetFrame>
  );
}
