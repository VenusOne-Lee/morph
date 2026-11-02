import type { ReportSpec } from '@morph-reports/spec';

/** One-line text preview of a report for the keep/discard list. */
export function reportPreviewLine(spec: ReportSpec): string {
  const g = spec.groupBy?.length ? `by ${spec.groupBy.map((x) => x.split('.').pop()).join(' × ')}` : 'list';
  const m = (spec.measures ?? []).map((x) => (x.field ? `${x.fn}(${x.field.split('.').pop()})` : x.fn)).join(', ');
  const w = spec.widgets.map((x) => x.type).join('/');
  return `${spec.source} ${g}${m ? ` · ${m}` : ''} · ${w}${spec.actions?.length ? ` · actions: ${spec.actions.join(', ')}` : ''}`;
}
