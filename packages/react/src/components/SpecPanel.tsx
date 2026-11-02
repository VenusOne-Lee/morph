import type { ReportSpec } from '@morph-reports/spec';
import { useMorph } from '../context.js';

/** Read-only view of the report spec behind a panel (dev mode, MO-505). Specs, never SQL. */
export function SpecPanel(props: { spec: ReportSpec }) {
  const { t } = useMorph();
  const { $schema: _schema, ...rest } = props.spec;
  return (
    <div className="morph-panel-body" style={{ borderBottom: '1px solid var(--morph-line)' }}>
      <pre className="morph-spec" tabIndex={0} aria-label={t('spec.label', { id: props.spec.id })}>
        {JSON.stringify(rest, null, 2)}
      </pre>
    </div>
  );
}
