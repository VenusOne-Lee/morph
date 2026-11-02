import type { MeasureFn } from './types.js';

/**
 * Client-side aggregation (MO-207). Pure functions over fetched rows:
 * group by one or two columns, measures, subtotals, grand total and
 * top-N with "Other".
 */

export type Row = Record<string, unknown>;

export interface MeasureDef {
  fn: MeasureFn;
  column?: string;
  /** Key for the result; defaults to `fn` or `fn_column`. */
  as?: string;
}

export interface Group {
  key: string;
  values: Record<string, number | null>;
  count: number;
  rows: Row[];
  children?: Group[];
}

export interface Aggregation {
  groups: Group[];
  totals: Record<string, number | null>;
  count: number;
}

export interface AggregateOptions {
  groupBy?: string[];
  measures?: MeasureDef[];
  /** Fixed key order per group column, e.g. enum order. Unknown keys go last. */
  order?: Record<string, string[]>;
  /** Sort groups by a measure instead of key order. */
  sortBy?: { measure: string; dir: 'asc' | 'desc' };
  /** Keep the top N groups and fold the rest into "Other". */
  topN?: number;
  otherLabel?: string;
}

export const NULL_KEY = '(none)';

export function measureKey(m: MeasureDef): string {
  return m.as ?? (m.column ? `${m.fn}_${m.column}` : m.fn);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function computeMeasures(rows: Row[], measures: MeasureDef[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const m of measures) {
    const key = measureKey(m);
    if (m.fn === 'count') {
      out[key] = m.column ? rows.filter((r) => r[m.column!] !== null && r[m.column!] !== undefined).length : rows.length;
      continue;
    }
    if (m.fn === 'count_distinct') {
      out[key] = new Set(rows.map((r) => r[m.column!]).filter((v) => v !== null && v !== undefined).map(String)).size;
      continue;
    }
    let sum = 0;
    let n = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      const v = num(r[m.column!]);
      if (v === null) continue;
      sum += v;
      n++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[key] = m.fn === 'sum' ? sum : n === 0 ? null : m.fn === 'avg' ? sum / n : m.fn === 'min' ? min : max;
  }
  return out;
}

function keyOf(v: unknown): string {
  if (v === null || v === undefined || v === '') return NULL_KEY;
  return String(v);
}

function groupRows(rows: Row[], column: string, measures: MeasureDef[], opts: AggregateOptions): Group[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r[column]);
    let list = map.get(k);
    if (!list) map.set(k, (list = []));
    list.push(r);
  }
  const order = opts.order?.[column];
  let groups: Group[] = [...map.entries()].map(([key, list]) => ({ key, rows: list, count: list.length, values: computeMeasures(list, measures) }));
  if (order) {
    // Keep enum order, and include empty groups for known values so charts show every stage.
    for (const k of order) if (!map.has(k)) groups.push({ key: k, rows: [], count: 0, values: computeMeasures([], measures) });
    const idx = (k: string) => {
      const i = order.indexOf(k);
      return i === -1 ? order.length + (k === NULL_KEY ? 1 : 0) : i;
    };
    groups.sort((a, b) => idx(a.key) - idx(b.key) || a.key.localeCompare(b.key));
  } else if (opts.sortBy) {
    const { measure, dir } = opts.sortBy;
    groups.sort((a, b) => ((a.values[measure] ?? -Infinity) - (b.values[measure] ?? -Infinity)) * (dir === 'asc' ? 1 : -1));
  } else {
    groups.sort((a, b) => (a.key === NULL_KEY ? 1 : b.key === NULL_KEY ? -1 : a.key.localeCompare(b.key, undefined, { numeric: true })));
  }
  if (opts.topN && groups.length > opts.topN) {
    const keep = groups.slice(0, opts.topN);
    const rest = groups.slice(opts.topN).flatMap((g) => g.rows);
    keep.push({ key: opts.otherLabel ?? 'Other', rows: rest, count: rest.length, values: computeMeasures(rest, measures) });
    groups = keep;
  }
  return groups;
}

export function aggregate(rows: Row[], opts: AggregateOptions = {}): Aggregation {
  const measures = opts.measures?.length ? opts.measures : [{ fn: 'count' as const }];
  const [g1, g2] = opts.groupBy ?? [];
  const groups = g1 ? groupRows(rows, g1, measures, opts) : [];
  if (g2) for (const g of groups) g.children = groupRows(g.rows, g2, measures, { ...opts, topN: undefined });
  return { groups, totals: computeMeasures(rows, measures), count: rows.length };
}

/** Assigns numbers to buckets by inclusive upper edges: [7, 14, 30] -> 0–7, 8–14, 15–30, 30+. */
export function bucketIndex(value: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i++) if (value <= edges[i]!) return i;
  return edges.length;
}

/** Sorts rows by columns, nulls last. */
export function sortRows(rows: Row[], sort: { field: string; dir: 'asc' | 'desc' }[]): Row[] {
  return [...rows].sort((a, b) => {
    for (const s of sort) {
      const x = a[s.field];
      const y = b[s.field];
      if (x === y) continue;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const nx = num(x);
      const ny = num(y);
      const c = nx !== null && ny !== null ? nx - ny : String(x).localeCompare(String(y));
      if (c !== 0) return s.dir === 'asc' ? c : -c;
    }
    return 0;
  });
}
