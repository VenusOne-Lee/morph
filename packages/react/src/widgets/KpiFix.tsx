import { useMemo, useState } from 'react';
import { formatMoney } from '@morph-reports/spec';
import { isOpen, rowName, terminalPair } from '../meta.js';
import { leastLoaded } from '../helpers.js';
import { nounFor } from '../components/PreviewModal.js';
import type { WidgetProps } from '../registry.js';
import { useWidget, WidgetFrame } from './frame.js';

/** KPI with a fix (MO-604): idle rows, their value at risk, and one bulk action to clear them. */
export function KpiFix(props: WidgetProps) {
  const w = useWidget(props);
  const { meta, rows, t, m } = w;
  const days = meta.idleDays;
  const idle = useMemo(
    () => rows.filter((r) => isOpen(meta, r) && meta.days && Number(r[meta.days.col]) > days).sort((a, b) => Number(b[meta.days!.col]) - Number(a[meta.days!.col])),
    [rows, meta, days],
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const bulkMax = Math.min(w.allowed.stage?.bulkMax ?? 25, w.allowed.owner?.bulkMax ?? 25);
  const included = idle.filter((r) => !excluded.has(String(r[meta.idCol]))).slice(0, bulkMax);
  const ids = included.map((r) => String(r[meta.idCol]));
  const sum = (list: typeof idle) => (meta.money ? list.reduce((s, r) => s + Number(r[meta.money!.col] ?? 0), 0) : list.length);
  const lose = terminalPair(meta).lose;
  const to = w.owners ? leastLoaded(meta, rows, w.owners) : null;
  const acting = w.view !== 'report' && w.canAct && idle.length > 0;

  return (
    <WidgetFrame w={w} widget={props}>
      <div className="morph-kpi">
        <div className="label">{t('kpi.idle', { days })}</div>
        <div className="value morph-num">
          {idle.length}
          {meta.money && idle.length > 0 && <span className="delta down">{t('kpi.atRisk', { value: formatMoney(sum(idle), meta.money.currency) })}</span>}
        </div>
      </div>
      {idle.length === 0 ? (
        <p className="morph-muted">{t('kpi.idleZero', { days })}</p>
      ) : (
        acting && (
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <div className="morph-includes">
              {idle.map((r) => {
                const id = String(r[meta.idCol]);
                return (
                  <label key={id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!excluded.has(id)}
                      aria-label={t('kpi.include', { name: rowName(meta, r) })}
                      onChange={() => setExcluded((s) => {
                        const n = new Set(s);
                        if (n.has(id)) n.delete(id);
                        else n.add(id);
                        return n;
                      })}
                    />
                    <span>{rowName(meta, r)}</span>
                    <span className="morph-num morph-muted">{Number(r[meta.days!.col])}d</span>
                  </label>
                );
              })}
            </div>
            <div className="morph-qactions">
              {w.allowed.stage && lose && (
                <button type="button" className="morph-btn primary" disabled={!ids.length} onClick={(e) => m.openPreview({ actionId: w.allowed.stage!.id, ids, to: lose, reportId: props.report, returnFocus: e.currentTarget })}>
                  {t('kpi.closeAs', { count: ids.length, stage: meta.status?.labels[lose] ?? lose })}
                </button>
              )}
              {w.allowed.owner && to && (
                <button type="button" className="morph-btn" disabled={!ids.length} onClick={(e) => m.openPreview({ actionId: w.allowed.owner!.id, ids, to: to.id, reportId: props.report, returnFocus: e.currentTarget })}>
                  {t('kpi.reassignTo', { owner: to.name })}
                </button>
              )}
            </div>
            <span className="morph-muted" style={{ fontSize: 12.5 }}>{t('kpi.count', { count: ids.length, noun: nounFor(meta.noun, ids.length) })}</span>
          </div>
        )
      )}
    </WidgetFrame>
  );
}
