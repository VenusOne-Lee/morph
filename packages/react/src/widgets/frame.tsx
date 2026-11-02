import { useCallback, useId, useState, type ReactNode } from 'react';
import { formatMoney, type WidgetView } from '@morph-reports/spec';
import { useMorph, useReport } from '../context.js';
import { Panel, Skeleton, StateMessage, ViewSwitcher } from '../components/primitives.js';
import { describeSource, useAllowedActions } from '../helpers.js';
import type { WidgetProps } from '../registry.js';
import type { ReportMeta } from '../meta.js';

/** Shared state for every widget: rows, meta, the view and which actions the viewer may use. */
export function useWidget(props: WidgetProps) {
  const m = useMorph();
  const report = useReport(props.report, props.filters);
  const allowed = useAllowedActions(report.meta, props.actions);
  const canAct = !!(allowed.stage || allowed.owner);
  const [view, setView] = useState<WidgetView>(props.view ?? props.widget.view ?? 'combined');
  const effective: WidgetView = canAct ? view : 'report';
  const money = report.meta.money;
  const fmt = (n: number) => (money ? formatMoney(n, money.currency) : String(Math.round(n)));
  const owners = report.meta.owner?.action?.target ? m.owners(report.meta.owner.action.target.entity, report.meta.owner.action.target.field, report.meta.owner.action.target.display) : null;
  return { m, t: m.t, ...report, allowed, canAct, view: effective, setView, fmt, owners };
}

export type WidgetCtx = ReturnType<typeof useWidget>;

/** Polite live region. Returns [node, announce]. */
export function useAnnouncer(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState('');
  const announce = useCallback((s: string) => {
    setMsg('');
    setTimeout(() => setMsg(s), 30);
  }, []);
  return [
    <div key="live" className="morph-sr" role="status" aria-live="polite">
      {msg}
    </div>,
    announce,
  ];
}

/** Panel chrome (title, source line, view switcher, footer) unless embedded. Also handles loading and errors. */
export function WidgetFrame(props: { w: WidgetCtx; widget: WidgetProps; title?: string; controls?: ReactNode; children: ReactNode; foot?: ReactNode | false }) {
  const { w } = props;
  const id = useId();
  const meta: ReportMeta = w.meta;
  const body =
    meta.spec.broken ? (
      <StateMessage tone="error" title={w.t('report.broken', { reason: meta.spec.broken.reason })} />
    ) : w.status === 'loading' || w.status === 'idle' ? (
      <Skeleton label={w.t('report.loading')} rows={3} />
    ) : w.status === 'error' && w.error ? (
      <StateMessage tone="error" title={w.error.message} hint={w.error.hint} action={<button type="button" className="morph-btn" onClick={() => void w.refetch()}>{w.t('report.retry')}</button>} />
    ) : (
      props.children
    );
  if (props.widget.embedded) return <div className="morph-widget">{body}</div>;
  const foot =
    props.foot === false
      ? undefined
      : (props.foot ??
        (w.canAct ? (
          <span>{w.view === 'report' ? w.t('views.footerReport') : w.view === 'act' ? w.t('views.footerAct', { name: w.m.viewer.name ?? '—' }) : w.t('views.footerCombined')}</span>
        ) : undefined));
  return (
    <Panel
      title={props.title ?? props.widget.widget.title ?? meta.spec.title}
      labelledBy={id}
      src={describeSource(meta)}
      className={props.widget.className}
      controls={
        <>
          {props.controls}
          <ViewSwitcher value={w.view} onChange={w.setView} canAct={w.canAct} t={w.t} />
        </>
      }
      foot={foot}
    >
      <div className="morph-panel-body">{body}</div>
    </Panel>
  );
}
