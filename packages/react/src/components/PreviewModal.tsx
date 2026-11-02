import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { applyAction, formatMoney, isMorphError, MorphError, payloadFromPreview, previewAction, type ApplyResult, type PreviewResult } from '@morph-reports/spec';
import { useMorph } from '../context.js';
import { isOpen, type Row } from '../meta.js';

export interface PreviewRequest {
  actionId: string;
  ids: string[];
  to?: string;
  /** Report the request came from: used for impact bars and the version check. */
  reportId?: string;
  returnFocus?: HTMLElement | null;
}

export function nounFor(plural: string, n: number): string {
  if (n !== 1) return plural;
  if (/ies$/.test(plural)) return plural.slice(0, -3) + 'y';
  return plural.replace(/s$/, '');
}

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * The preview modal (MO-709 – MO-711, MO-716). Nothing is written until
 * the viewer presses Apply, and Apply sends exactly the previewed versions.
 */
export function PreviewModal(props: { request: PreviewRequest; onClose(): void; onApplied(req: PreviewRequest, res: ApplyResult, toLabel: string): void; onFailed(e: MorphError): void }) {
  const m = useMorph();
  const { t } = m;
  const req = props.request;
  const action = m.project.actions.actions.find((a) => a.id === req.actionId);
  const meta = req.reportId ? m.meta(req.reportId) : null;
  const rows: Row[] = req.reportId ? m.store(req.reportId).state.rows : [];
  const [to, setTo] = useState<string | null>(req.to ?? null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<MorphError | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const selectId = useId();
  const returnTo = useRef<HTMLElement | null>(req.returnFocus ?? (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null));

  const owners = action?.kind === 'set_fk' && action.target ? m.owners(action.target.entity, action.target.field, action.target.display) : null;
  const options: { value: string; label: string }[] =
    action?.kind === 'set_enum' ? (action.values ?? []).map((v) => ({ value: v, label: m.project.model.enums[m.project.model.entities[action.table]?.fields[action.column]?.enum ?? '']?.labels[v] ?? v })) : (owners ?? []).map((o) => ({ value: o.id, label: o.name }));

  // Default target: first option that differs from the first row's current value.
  useEffect(() => {
    if (to || !options.length) return;
    const first = rows.find((r) => req.ids.includes(String(r[meta?.idCol ?? '_morph_id'])));
    const cur = first ? String(first[action?.kind === 'set_enum' ? (meta?.status?.col ?? '') : (meta?.owner?.rawCol ?? '')] ?? '') : '';
    setTo(options.find((o) => o.value !== cur)?.value ?? options[0]!.value);
  }, [options.length]);

  useEffect(() => {
    if (!to || !action) return;
    let live = true;
    setError(null);
    previewAction(m.client, { action: action.id, ids: req.ids, to })
      .then((p) => live && setPreview(p))
      .catch((e: unknown) => live && setError(isMorphError(e) ? e : new MorphError('unknown', String(e))));
    return () => {
      live = false;
    };
  }, [to, action, m.client, req.ids]);

  const close = useCallback(() => {
    props.onClose();
    setTimeout(() => returnTo.current?.focus?.(), 0);
  }, [props]);

  useEffect(() => {
    const el = dialog.current;
    const firstFocus = (el?.ownerDocument.getElementById(selectId) as HTMLElement | null) ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    firstFocus?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
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
  }, [close, selectId]);

  if (!action) return null;
  const isEnum = action.kind === 'set_enum';
  const toLabel = options.find((o) => o.value === to)?.label ?? preview?.toDisplay ?? to ?? '';
  const changing = preview?.rows.filter((r) => !r.skipped) ?? [];
  const denied = preview ? preview.changed - preview.allowed : 0;
  const money = meta?.money;
  const byId = new Map(rows.map((r) => [String(r[meta?.idCol ?? '_morph_id']), r]));
  const value = money ? changing.reduce((s, r) => s + Number(byId.get(r.id)?.[money.col] ?? 0), 0) : 0;
  const stale = changing.some((r) => {
    const row = byId.get(r.id);
    return row && meta && row[meta.versionCol] !== undefined && String(row[meta.versionCol]) !== r.version;
  });

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await applyAction(m.client, payloadFromPreview(preview));
      props.onApplied(req, res, toLabel);
      setTimeout(() => returnTo.current?.focus?.(), 0);
    } catch (e) {
      const err = isMorphError(e) ? e : new MorphError('unknown', String(e));
      setError(err);
      props.onFailed(err);
    } finally {
      setBusy(false);
    }
  };

  const labelOf = (v: unknown) => {
    if (isEnum) return options.find((o) => o.value === v)?.label ?? String(v ?? '—');
    return (owners ?? []).find((o) => o.id === String(v))?.name ?? String(v ?? '—');
  };

  return (
    <div className="morph-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="morph-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
        <div className="morph-modal-head">
          <div>
            <span className="morph-badge accent">
              <span className="dot" />
              {t('preview.badge')}
            </span>
            <h2 className="morph-modal-title" id={titleId}>
              {t(isEnum ? 'preview.titleMove' : 'preview.titleReassign', { count: req.ids.length, noun: nounFor(meta?.noun ?? 'rows', req.ids.length) })}
            </h2>
            {money && value > 0 && <div className="morph-muted">{t('preview.subtitleValue', { value: formatMoney(value, money.currency) })}</div>}
          </div>
          <button type="button" className="morph-btn ghost" aria-label={t('preview.close')} onClick={close}>
            ×
          </button>
        </div>
        <div className="morph-modal-body">
          <div>
            <label className="morph-eyebrow" htmlFor={selectId} style={{ display: 'block' }}>
              {isEnum ? t('preview.newStage', { field: action.column.replace(/_/g, ' ') }) : t('preview.newOwner')}
            </label>
            <select id={selectId} className="morph-select" value={to ?? ''} onChange={(e) => setTo(e.target.value)}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {!preview && !error && (
            <div role="status" className="morph-muted">
              {t('preview.loading')}
            </div>
          )}

          {preview && meta && rows.length > 0 && <Impact meta={meta} rows={rows} preview={preview} isEnum={isEnum} labelOf={labelOf} />}

          {preview && (
            <div>
              <div className="morph-eyebrow">{t('preview.changes', { count: changing.length })}</div>
              <div className="morph-diff">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('preview.colRecord')}</th>
                      <th scope="col">{t('preview.colField')}</th>
                      <th scope="col">{t('preview.colChange')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.display ?? r.id}</td>
                        <td className="morph-mono">{r.field}</td>
                        <td>
                          {r.skipped ? (
                            <span className="morph-muted">{t('preview.already', { value: labelOf(r.before) })}</span>
                          ) : (
                            <>
                              <del>{labelOf(r.before)}</del> → <ins>{labelOf(r.after)}</ins>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview?.terminal && money && value > 0 && <div className="morph-alert warn">{t('preview.terminal', { value: formatMoney(value, money.currency), stage: toLabel })}</div>}
          {preview && preview.changed === 0 && <div className="morph-alert info">{t('preview.nothing')}</div>}

          {preview && (
            <div>
              <div className="morph-eyebrow">{denied > 0 || stale ? t('preview.checksFailed') : t('preview.checks')}</div>
              <ul className="morph-checks">
                <li>
                  <span className={denied > 0 ? 'no' : 'ok'} aria-hidden="true">
                    {denied > 0 ? '✕' : '✓'}
                  </span>
                  {denied > 0 ? (
                    <span>{t('preview.checkDenied', { count: denied })}</span>
                  ) : preview.policies.length === 1 ? (
                    <span>
                      {t('preview.checkPolicy', { name: preview.actor ?? m.viewer.name ?? '—' })} <code className="morph-code">{preview.policies[0]}</code>
                    </span>
                  ) : (
                    <span>{t('preview.checkPolicies', { name: preview.actor ?? '—', table: action.table })}</span>
                  )}
                </li>
                <li>
                  <span className="ok" aria-hidden="true">✓</span>
                  <span>{t('preview.checkBulk', { count: req.ids.length, max: preview.bulkMax })}</span>
                </li>
                <li>
                  <span className={stale ? 'no' : 'ok'} aria-hidden="true">
                    {stale ? '✕' : '✓'}
                  </span>
                  <span>{stale ? `${t('preview.checkConcurrency')}: ✕` : t('preview.checkConcurrency')}</span>
                </li>
                <li>
                  <span className="ok" aria-hidden="true">✓</span>
                  <span>{t('preview.checkAudit', { date: new Intl.DateTimeFormat(m.config.locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(preview.undoUntil)) })}</span>
                </li>
              </ul>
            </div>
          )}

          {error && (
            <div className="morph-alert" role="alert">
              {error.message}
              {error.hint ? ` ${error.hint}` : ''}
            </div>
          )}
        </div>
        <div className="morph-modal-foot">
          <span className="morph-muted" style={{ fontSize: 13 }}>
            {t('preview.footer')}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="morph-btn" onClick={close}>
              {t('preview.cancel')}
            </button>
            <button type="button" className="morph-btn primary" disabled={!preview || busy || denied > 0 || preview.changed === 0} onClick={apply}>
              {busy ? t('preview.applying') : t('preview.apply', { count: preview?.changed ?? 0 })}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function Impact(props: { meta: NonNullable<ReturnType<ReturnType<typeof useMorph>['meta']>>; rows: Row[]; preview: PreviewResult; isEnum: boolean; labelOf(v: unknown): string }) {
  const { meta, rows, preview, isEnum } = props;
  const m = useMorph();
  const col = isEnum ? meta.status?.col : meta.owner?.rawCol;
  if (!col) return null;
  const open = rows.filter((r) => isOpen(meta, r));
  const now = new Map<string, number>();
  for (const r of open) now.set(String(r[col]), (now.get(String(r[col])) ?? 0) + 1);
  const after = new Map(now);
  for (const r of preview.rows.filter((x) => !x.skipped)) {
    const from = String(r.before);
    after.set(from, (after.get(from) ?? 0) - 1);
    const terminal = isEnum && meta.status?.terminal.includes(String(r.after));
    if (!terminal) after.set(String(r.after), (after.get(String(r.after)) ?? 0) + 1);
  }
  const keys = [...new Set(preview.rows.filter((x) => !x.skipped).flatMap((r) => [String(r.before), String(r.after)]))].filter((k) => !(isEnum && meta.status?.terminal.includes(k)));
  const max = Math.max(1, ...keys.map((k) => Math.max(now.get(k) ?? 0, after.get(k) ?? 0)), isEnum ? 0 : meta.ownerCap);
  if (!keys.length) return null;
  return (
    <div>
      <div className="morph-eyebrow">{m.t('preview.impact')}</div>
      <div className="morph-impact">
        {keys.map((k) => {
          const a = now.get(k) ?? 0;
          const b = after.get(k) ?? 0;
          return (
            <div key={k} style={{ display: 'contents' }}>
              <span>{props.labelOf(k)}</span>
              <span className="bars" aria-hidden="true">
                <span className="now" style={{ width: `${(a / max) * 100}%` }} />
                <span className={`after${!isEnum && b > meta.ownerCap ? ' over' : ''}`} style={{ width: `${(b / max) * 100}%` }} />
              </span>
              <span className="morph-num">
                {a} → <b>{b}</b>
              </span>
            </div>
          );
        })}
      </div>
      <p className="morph-muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
        {m.t('preview.impactNote')}
        {!isEnum ? ` ${m.t('preview.impactCap', { cap: meta.ownerCap })}` : ''}
      </p>
    </div>
  );
}
