import { useCallback, useEffect, useId, useState } from 'react';
import { listAudit, type AuditEntry, type MorphError } from '@morph-reports/spec';
import { useMorph } from './context.js';
import { Panel, Skeleton, StateMessage } from './components/primitives.js';

export interface MorphAuditLogProps {
  limit?: number;
  className?: string;
}

/** The action log (MO-705): who did what, when, and an Undo while the window is open. RLS decides which rows show. */
export function MorphAuditLog(props: MorphAuditLogProps) {
  const m = useMorph();
  const { t } = m;
  const id = useId();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<MorphError | Error | null>(null);
  const load = useCallback(() => {
    listAudit(m.client, { limit: props.limit ?? 50 })
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e: Error) => setError(e));
  }, [m.client, props.limit]);
  useEffect(load, [load, m.flash]);

  const actionLabel = (a: AuditEntry) => {
    const def = m.project.actions.actions.find((x) => x.id === a.action);
    const to = a.to_display ?? a.to_value ?? '';
    const enumId = def ? m.project.model.entities[def.table]?.fields[def.column]?.enum : undefined;
    const toLabel = def?.kind === 'set_enum' && enumId ? (m.project.model.enums[enumId]?.labels[to] ?? to) : to;
    return def?.kind === 'set_fk' ? t('audit.actionReassign', { to: toLabel }) : t('audit.actionMove', { to: toLabel });
  };
  const undoDays = (_a: AuditEntry) => m.project.actions.undoDays ?? 30;
  const fmtWhen = (s: string) => new Date(s).toLocaleString(m.config.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <Panel title={t('audit.title')} labelledBy={id} src="morph_audit" className={props.className}>
      {error ? (
        <StateMessage tone="error" title={error.message} action={<button type="button" className="morph-btn" onClick={load}>{t('report.retry')}</button>} />
      ) : !rows ? (
        <Skeleton label={t('report.loading')} chart={false} rows={3} />
      ) : rows.length === 0 ? (
        <StateMessage title={t('audit.empty')} />
      ) : (
        <div className="morph-table-wrap">
          <table className="morph-table">
            <thead>
              <tr>
                <th scope="col" className="num">{t('audit.colNo')}</th>
                <th scope="col">{t('audit.colWhen')}</th>
                <th scope="col">{t('audit.colWho')}</th>
                <th scope="col">{t('audit.colAction')}</th>
                <th scope="col" className="num">{t('audit.colRows')}</th>
                <th scope="col">{t('audit.colStatus')}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const open = !a.undone_at && Date.now() - new Date(a.created_at).getTime() < undoDays(a) * 86_400_000;
                return (
                  <tr key={a.id}>
                    <td className="num morph-num">{rows.length - i}</td>
                    <td className="morph-num">{fmtWhen(a.created_at)}</td>
                    <td>
                      {a.actor_name ?? a.actor}
                      {a.source === 'mcp' && <div className="sub">{t('audit.via', { source: 'MCP' })}</div>}
                    </td>
                    <td>
                      {actionLabel(a)}
                      <div className="sub">{a.rows.map((r) => r.display ?? r.id).slice(0, 3).join(', ')}{a.rows.length > 3 ? '…' : ''}</div>
                    </td>
                    <td className="num morph-num">{a.row_count}</td>
                    <td>
                      <span className={`morph-badge${a.undone_at ? '' : ' accent'}`}>
                        <span className="dot" />
                        {a.undone_at ? t('audit.undone') : t('audit.applied')}
                      </span>
                    </td>
                    <td className="num">
                      {open && (
                        <button type="button" className="morph-btn sm" onClick={() => void m.undo(a.id).then(load)}>{t('audit.undo')}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
