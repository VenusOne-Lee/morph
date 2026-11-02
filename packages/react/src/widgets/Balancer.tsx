import { useState, type DragEvent } from 'react';
import { isOpen, isStuck, rowName, type Row } from '../meta.js';
import { WorkloadBars } from '../charts/index.js';
import { initials, StateMessage } from '../components/primitives.js';
import type { WidgetProps } from '../registry.js';
import { useAnnouncer, useWidget, WidgetFrame } from './frame.js';

export interface OwnerLoad {
  id: string;
  name: string;
  open: Row[];
  stuck: Row[];
}

/** Open rows per owner, including owners with none (from the owner list the viewer can see). */
export function ownerLoads(w: ReturnType<typeof useWidget>): OwnerLoad[] {
  const { meta, rows } = w;
  if (!meta.owner) return [];
  const map = new Map<string, OwnerLoad>();
  for (const o of w.owners ?? []) map.set(o.id, { id: o.id, name: o.name, open: [], stuck: [] });
  for (const r of rows) {
    if (!isOpen(meta, r)) continue;
    const id = String(r[meta.owner.rawCol] ?? '');
    if (!map.has(id)) map.set(id, { id, name: String((meta.owner.col && r[meta.owner.col]) ?? id), open: [], stuck: [] });
    const l = map.get(id)!;
    l.open.push(r);
    if (isStuck(meta, r)) l.stuck.push(r);
  }
  // Owners who hold rows first, then by load, then by name.
  return [...map.values()].sort((a, b) => b.open.length - a.open.length || a.name.localeCompare(b.name));
}

/** Owner balancer (MO-602): lanes per owner with a cap. Click a chip then an owner, or drag. */
export function Balancer(props: WidgetProps) {
  const w = useWidget(props);
  const { meta, t, m } = w;
  const [picked, setPicked] = useState<Row | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [live, announce] = useAnnouncer();
  const acting = w.view !== 'report' && !!w.allowed.owner;
  const cap = meta.ownerCap;
  const loads = ownerLoads(w);

  if (!meta.owner) return <WidgetFrame w={w} widget={props}><StateMessage title={t('error.generic')} /></WidgetFrame>;

  const give = (row: Row, to: string, el?: HTMLElement | null) => {
    setPicked(null);
    setOver(null);
    if (!w.allowed.owner || String(row[meta.owner!.rawCol]) === to) return;
    m.openPreview({ actionId: w.allowed.owner.id, ids: [String(row[meta.idCol])], to, reportId: props.report, returnFocus: el ?? null });
  };
  const onDrop = (e: DragEvent, to: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const row = w.rows.find((r) => String(r[meta.idCol]) === id);
    if (row) give(row, to, e.currentTarget as HTMLElement);
  };

  const chart = (
    <WorkloadBars
      title={meta.spec.title}
      cap={cap}
      capLabel={t('balancer.cap', { cap })}
      owners={loads.map((l) => ({ key: l.id, label: l.name, open: l.open.length, stuck: l.stuck.length, stuckLabel: t('balancer.stuck', { count: l.stuck.length }) }))}
    />
  );
  if (!acting) return <WidgetFrame w={w} widget={props}>{chart}</WidgetFrame>;

  return (
    <WidgetFrame w={w} widget={props}>
      {live}
      {w.view === 'combined' && <div style={{ marginBottom: 14 }}>{chart}</div>}
      {picked && (
        <div className="morph-alert" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span>{t('balancer.picked', { name: rowName(meta, picked) })}</span>
          <button type="button" className="morph-btn sm" onClick={() => setPicked(null)}>{t('kanban.cancelPick')}</button>
        </div>
      )}
      <div className="morph-lanes" role="list">
        {loads.map((l) => {
          const isOver = l.open.length > cap;
          const target = over === l.id || (picked && String(picked[meta.owner!.rawCol]) !== l.id);
          return (
            <div
              key={l.id}
              role="listitem"
              className={`morph-lane${isOver ? ' over' : ''}${target ? ' target' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(l.id); }}
              onDragLeave={() => setOver((o) => (o === l.id ? null : o))}
              onDrop={(e) => onDrop(e, l.id)}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                <span className="morph-avatar" aria-hidden="true">{initials(l.name)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13.5 }}>{l.name}</div>
                  <div className="morph-num" style={{ fontSize: 12, color: isOver ? 'var(--morph-bad)' : 'var(--morph-muted)' }}>
                    {t('balancer.open', { count: l.open.length })} · {isOver ? t('balancer.overCap') : t('balancer.cap', { cap })}
                  </div>
                </div>
              </div>
              <div className="morph-lane-chips">
                {l.open.map((r) => {
                  const id = String(r[meta.idCol]);
                  const fl = m.flash.get(id);
                  const days = meta.days ? Number(r[meta.days.col]) : 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      draggable
                      className={`morph-ochip${fl ? ` morph-flash-${fl}` : ''}`}
                      aria-pressed={picked === r}
                      aria-label={t('balancer.chipLabel', { name: rowName(meta, r), days })}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => {
                        const next = picked === r ? null : r;
                        setPicked(next);
                        if (next) announce(t('balancer.picked', { name: rowName(meta, r) }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setPicked(null);
                      }}
                    >
                      {isStuck(meta, r) && <span className="reddot" aria-hidden="true" />}
                      {rowName(meta, r)}
                    </button>
                  );
                })}
                {picked && String(picked[meta.owner!.rawCol]) !== l.id && (
                  <button type="button" className="morph-btn sm here" onClick={(e) => give(picked, l.id, e.currentTarget)}>{t('balancer.moveHere', { owner: l.name })}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </WidgetFrame>
  );
}
