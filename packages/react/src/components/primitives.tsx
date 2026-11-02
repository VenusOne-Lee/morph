import type { ReactNode } from 'react';
import type { WidgetView } from '@morph-reports/spec';
import type { T } from '../i18n.js';

export function Panel(props: { title: ReactNode; src?: ReactNode; controls?: ReactNode; children: ReactNode; foot?: ReactNode; className?: string; labelledBy?: string; style?: React.CSSProperties }) {
  return (
    <section className={`morph-panel${props.className ? ` ${props.className}` : ''}`} aria-labelledby={props.labelledBy} style={props.style}>
      <header className="morph-panel-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="morph-panel-title" id={props.labelledBy}>
            {props.title}
          </h3>
          {props.src && <div className="morph-panel-src">{props.src}</div>}
        </div>
        {props.controls && <div className="morph-controls">{props.controls}</div>}
      </header>
      {props.children}
      {props.foot && <footer className="morph-panel-foot">{props.foot}</footer>}
    </section>
  );
}

export function Segmented<V extends string>(props: { label: string; value: V; options: { value: V; label: string }[]; onChange(v: V): void; className?: string; showLabel?: boolean }) {
  return (
    <div className={`morph-seg${props.className ? ` ${props.className}` : ''}`} role="group" aria-label={props.label}>
      {props.showLabel !== false && <span className="morph-seg-label" aria-hidden="true">{props.label}</span>}
      {props.options.map((o) => (
        <button key={o.value} type="button" data-view={o.value} aria-pressed={props.value === o.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ViewSwitcher(props: { value: WidgetView; onChange(v: WidgetView): void; canAct: boolean; t: T }) {
  if (!props.canAct) return null;
  const { t } = props;
  return (
    <Segmented
      className="views"
      label={t('views.label')}
      showLabel={false}
      value={props.value}
      onChange={props.onChange}
      options={[
        { value: 'report', label: t('views.report') },
        { value: 'act', label: t('views.act') },
        { value: 'combined', label: t('views.combined') },
      ]}
    />
  );
}

export function Skeleton(props: { rows?: number; chart?: boolean; label: string }) {
  return (
    <div className="morph-panel-body" role="status" aria-label={props.label} aria-busy="true">
      {props.chart !== false && <div className="morph-skel" style={{ height: 120, marginBottom: 16 }} />}
      {Array.from({ length: props.rows ?? 5 }, (_, i) => (
        <div key={i} className="morph-skel" style={{ height: 36, marginBottom: 8 }} />
      ))}
    </div>
  );
}

export function StateMessage(props: { tone?: 'error' | 'empty'; title: string; hint?: string | undefined; action?: ReactNode }) {
  return (
    <div className={`morph-state${props.tone === 'error' ? ' error' : ''}`} role={props.tone === 'error' ? 'alert' : undefined}>
      <div>{props.title}</div>
      {props.hint && <small>{props.hint}</small>}
      {props.action}
    </div>
  );
}

export function initials(name: string | null): string {
  if (!name) return '·';
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
