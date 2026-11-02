import type { DerivedField, ReportFilter, ReportSpec } from '../types.js';
import type { ResolvedReport } from '../resolve.js';
import { ID_COLUMN, VERSION_COLUMN } from '../resolve.js';
import { splitRef } from '../refs.js';
import { qi, ql, qref } from './sql.js';

/**
 * Compiles a resolved report into a `security_invoker` view (MO-205).
 * The view selects only exposed fields, the joins in the spec and derived
 * columns. Spec filters go in the view; viewer filters are applied at
 * query time through PostgREST, never by string-building SQL.
 */
export function compileViewSql(r: ResolvedReport): string {
  const spec = r.spec;
  const select: string[] = [];
  for (const c of r.columns) {
    let expr: string;
    if (c.alias === ID_COLUMN) expr = `${qref(spec.source, c.field)}::text`;
    else if (c.alias === VERSION_COLUMN) expr = `${qref(spec.source, 'xmin')}::text`;
    else if (c.derived) expr = derivedSql(c.derived);
    else expr = qref(c.entity!, c.field);
    select.push(`  ${expr} as ${qi(c.alias)}`);
  }
  const from = [`from ${qi(r.schema)}.${qi(spec.source)} as ${qi(spec.source)}`];
  for (const j of r.joins) {
    from.push(`left join ${qi(r.schema)}.${qi(j.to.entity)} as ${qi(j.to.entity)} on ${qref(j.to.entity, j.to.field)} = ${qref(j.from.entity, j.from.field)}`);
  }
  const where = (spec.filters ?? []).map((f) => filterSql(f, spec));
  return [
    `-- Report: ${spec.title.replace(/\n/g, ' ')}`,
    `create or replace view ${qi(r.schema)}.${qi(r.view)} with (security_invoker = true) as`,
    'select',
    select.join(',\n'),
    from.join('\n'),
    where.length ? `where ${where.join('\n  and ')}` : null,
    ';',
    `revoke all on ${qi(r.schema)}.${qi(r.view)} from public, anon;`,
    `grant select on ${qi(r.schema)}.${qi(r.view)} to authenticated;`,
  ]
    .filter((l) => l !== null)
    .join('\n')
    .replace('\n;', ';');
}

export function derivedSql(d: DerivedField): string {
  if ('days_since' in d) {
    const [e, f] = splitRef(d.days_since)!;
    return `(current_date - ${qref(e, f)}::date)`;
  }
  if ('date_trunc' in d) {
    const [e, f] = splitRef(d.date_trunc.field)!;
    return `date_trunc(${ql(d.date_trunc.unit)}, ${qref(e, f)})::date`;
  }
  const [e, f] = splitRef(d.bucket.field)!;
  const col = qref(e, f);
  const edges = d.bucket.edges;
  const labels = d.bucket.labels ?? bucketLabels(edges);
  const whens = edges.map((edge, i) => `when ${col} <= ${ql(edge)} then ${ql(labels[i] ?? String(edge))}`);
  return `case ${whens.join(' ')} else ${ql(labels[edges.length] ?? `${edges[edges.length - 1]}+`)} end`;
}

export function bucketLabels(edges: number[]): string[] {
  const out: string[] = [];
  let lo = 0;
  for (const e of edges) {
    out.push(`${lo}–${e}`);
    lo = e + 1;
  }
  out.push(`${edges[edges.length - 1]! + 1}+`);
  return out;
}

function fieldExpr(field: string, spec: ReportSpec): string {
  const parts = splitRef(field);
  if (parts) return qref(parts[0], parts[1]);
  const d = spec.derived?.[field];
  if (!d) throw new Error(`Unknown field ${field}`);
  return derivedSql(d);
}

type Scalar = string | number | boolean | null;

export function filterSql(f: ReportFilter, spec: ReportSpec): string {
  const col = fieldExpr(f.field, spec);
  const v = f.value;
  const list = (vals: unknown) => (Array.isArray(vals) ? vals : [vals]).map((x) => ql(x as Scalar)).join(', ');
  switch (f.op) {
    case '=':
      return `${col} = ${ql(v as Scalar)}`;
    case '!=':
      return `${col} is distinct from ${ql(v as Scalar)}`;
    case 'in':
      return `${col} in (${list(v)})`;
    case 'not_in':
      return `${col} not in (${list(v)})`;
    case '>':
    case '>=':
    case '<':
    case '<=':
      return `${col} ${f.op} ${ql(v as Scalar)}`;
    case 'between': {
      const [a, b] = v as [Scalar, Scalar];
      return `${col} between ${ql(a)} and ${ql(b)}`;
    }
    case 'is_null':
      return `${col} is null`;
    case 'not_null':
      return `${col} is not null`;
    case 'contains': {
      const s = String(v).replace(/[\\%_]/g, (m) => `\\${m}`);
      return `${col}::text ilike ${ql(`%${s}%`)}`;
    }
    case 'last_n_days':
      return `${col} >= now() - make_interval(days => ${ql(Math.floor(Number(v)))})`;
    case 'this_month':
      return `date_trunc('month', ${col}) = date_trunc('month', now())`;
    case 'this_quarter':
      return `date_trunc('quarter', ${col}) = date_trunc('quarter', now())`;
  }
}
