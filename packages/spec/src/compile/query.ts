import type { FilterOp, FilterValue, ReportSort } from '../types.js';
import type { ResolvedReport } from '../resolve.js';
import { MorphError } from '../errors.js';

/** A viewer filter, on a report field (ref or alias). */
export interface RuntimeFilter {
  field: string;
  op: FilterOp;
  value?: FilterValue;
}

export interface QueryFilter {
  column: string;
  op: FilterOp;
  value?: FilterValue;
}

export interface QueryPlan {
  schema: string;
  view: string;
  columns: string[];
  filters: QueryFilter[];
  order: ReportSort[];
  limit: number | null;
}

/** Compiles viewer filters, sort and limit into a query on the report view (MO-206). */
export function compileQuery(r: ResolvedReport, runtime: RuntimeFilter[] = [], opts: { sort?: ReportSort[]; limit?: number } = {}): QueryPlan {
  const filters = runtime.map((f) => {
    const col = r.column(f.field);
    if (!col) throw new MorphError('spec_invalid', `"${f.field}" is not a field of report ${r.spec.id}.`, { hint: 'Filter on a field the report shows.' });
    return { column: col.alias, op: f.op, ...(f.value !== undefined ? { value: f.value } : {}) };
  });
  const order = (opts.sort ?? r.spec.sort ?? []).map((s) => {
    const col = r.column(s.field);
    if (!col) throw new MorphError('spec_invalid', `Can't sort by "${s.field}".`);
    return { field: col.alias, dir: s.dir };
  });
  return {
    schema: r.schema,
    view: r.view,
    columns: r.columns.map((c) => c.alias),
    filters,
    order,
    limit: opts.limit ?? r.spec.limit ?? null,
  };
}

/** Relative date ops become absolute ISO bounds on the client. */
export function relativeBounds(op: FilterOp, value: FilterValue | undefined, now = new Date()): { gte: string } | null {
  const d = new Date(now);
  if (op === 'last_n_days') {
    d.setUTCDate(d.getUTCDate() - Number(value));
    return { gte: d.toISOString() };
  }
  if (op === 'this_month') return { gte: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString() };
  if (op === 'this_quarter') return { gte: new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)).toISOString() };
  return null;
}

/** Applies a single filter to a row in memory (used after fetch and in tests). */
export function matchesFilter(row: Record<string, unknown>, f: QueryFilter, now = new Date()): boolean {
  const v = row[f.column];
  const val = f.value;
  const cmp = (a: unknown, b: unknown) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    const da = Date.parse(String(a));
    const db = Date.parse(String(b));
    if (!Number.isNaN(da) && !Number.isNaN(db) && typeof a !== 'number') return da - db;
    return String(a).localeCompare(String(b));
  };
  switch (f.op) {
    case '=':
      return v == val; // eslint-disable-line eqeqeq
    case '!=':
      return v != val; // eslint-disable-line eqeqeq
    case 'in':
      return Array.isArray(val) && val.some((x) => x == v); // eslint-disable-line eqeqeq
    case 'not_in':
      return Array.isArray(val) && !val.some((x) => x == v); // eslint-disable-line eqeqeq
    case '>':
      return v !== null && v !== undefined && cmp(v, val) > 0;
    case '>=':
      return v !== null && v !== undefined && cmp(v, val) >= 0;
    case '<':
      return v !== null && v !== undefined && cmp(v, val) < 0;
    case '<=':
      return v !== null && v !== undefined && cmp(v, val) <= 0;
    case 'between': {
      const [a, b] = val as [unknown, unknown];
      return v !== null && v !== undefined && cmp(v, a) >= 0 && cmp(v, b) <= 0;
    }
    case 'is_null':
      return v === null || v === undefined;
    case 'not_null':
      return v !== null && v !== undefined;
    case 'contains':
      return String(v ?? '').toLowerCase().includes(String(val).toLowerCase());
    default: {
      const b = relativeBounds(f.op, val, now);
      return b ? v !== null && v !== undefined && cmp(v, b.gte) >= 0 : true;
    }
  }
}
