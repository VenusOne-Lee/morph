import type { QueryFilter, QueryPlan } from '../compile/query.js';
import { relativeBounds } from '../compile/query.js';
import { MorphError } from '../errors.js';
import { DEFAULT_ROW_CAP } from '../types.js';
import type { FilterBuilderLike, SupabaseLike } from './client.js';
import { fromPostgrestError } from './errors.js';

export interface FetchResult {
  rows: Record<string, unknown>[];
  /** True when the report has more rows than the cap (MO-410). */
  capped: boolean;
}

export interface FetchOptions {
  cap?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

/** Applies a compiled filter to a supabase-js builder. Values never touch SQL text. */
export function applyFilter(q: FilterBuilderLike, f: QueryFilter): FilterBuilderLike {
  const v = f.value;
  const list = (Array.isArray(v) ? v : [v]) as unknown[];
  switch (f.op) {
    case '=':
      return v === null ? q.is(f.column, null) : q.eq(f.column, v);
    case '!=':
      return v === null ? q.not(f.column, 'is', null) : q.neq(f.column, v);
    case 'in':
      return q.in(f.column, list);
    case 'not_in':
      return q.not(f.column, 'in', `(${list.map(pgListItem).join(',')})`);
    case '>':
      return q.gt(f.column, v);
    case '>=':
      return q.gte(f.column, v);
    case '<':
      return q.lt(f.column, v);
    case '<=':
      return q.lte(f.column, v);
    case 'between':
      return q.gte(f.column, list[0]).lte(f.column, list[1]);
    case 'is_null':
      return q.is(f.column, null);
    case 'not_null':
      return q.not(f.column, 'is', null);
    case 'contains':
      return q.ilike(f.column, `%${String(v).replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    default: {
      const b = relativeBounds(f.op, v);
      return b ? q.gte(f.column, b.gte) : q;
    }
  }
}

function pgListItem(v: unknown): string {
  const s = String(v);
  return /[,()"\\\s]/.test(s) ? `"${s.replace(/["\\]/g, (m) => `\\${m}`)}"` : s;
}

/**
 * Reads a report view as the viewer, page by page, up to the row cap.
 * Fetches cap + 1 rows so it can say "more than 50,000" honestly.
 */
export async function fetchReportRows(client: SupabaseLike, plan: QueryPlan, opts: FetchOptions = {}): Promise<FetchResult> {
  const cap = opts.cap ?? DEFAULT_ROW_CAP;
  const pageSize = opts.pageSize ?? 1000;
  const want = plan.limit ? Math.min(plan.limit, cap + 1) : cap + 1;
  const db = plan.schema !== 'public' && client.schema ? client.schema(plan.schema) : client;
  const rows: Record<string, unknown>[] = [];
  while (rows.length < want) {
    if (opts.signal?.aborted) throw new MorphError('network', 'The request was cancelled.');
    let q = db.from(plan.view).select(plan.columns.join(','));
    for (const f of plan.filters) q = applyFilter(q, f);
    for (const o of plan.order) q = q.order(o.field, { ascending: o.dir === 'asc', nullsFirst: false });
    // Stable paging: always break ties on the row id.
    if (plan.columns.includes('_morph_id')) q = q.order('_morph_id', { ascending: true });
    const from = rows.length;
    const to = Math.min(from + pageSize, want) - 1;
    q = q.range(from, to);
    if (opts.signal && q.abortSignal) q = q.abortSignal(opts.signal);
    const res = await q;
    if (res.error) throw fromPostgrestError(res.error, { relation: plan.view });
    const page = (res.data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }
  const capped = !plan.limit && rows.length > cap;
  return { rows: capped ? rows.slice(0, cap) : rows, capped };
}
