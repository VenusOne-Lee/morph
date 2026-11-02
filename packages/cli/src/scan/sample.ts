import type { ClientBase } from 'pg';
import { qi } from '@morph-reports/spec';
import type { IntroColumn, IntroTable } from './introspect.js';

/** Aggregates only (MO-105). Top values live in memory and are discarded after classification. */
export interface ColumnStats {
  nullRatio: number;
  distinct: number;
  min: string | number | null;
  max: string | number | null;
  /** Low-cardinality text only: top 20 values with counts. */
  top: { value: string; count: number }[] | null;
  /** Shape checks run on a handful of values in memory; values are never kept. */
  shape: { email: number; phone: number; saId: number; url: number; checked: number } | null;
}

export interface SampleOptions {
  /** Columns never sampled (already PII by name). */
  skip: (table: IntroTable, column: IntroColumn) => boolean;
  /** Use TABLESAMPLE above this many rows. */
  sampleAbove?: number;
  deadline?: number;
}

const TEXTY = /^(text|character varying|varchar|character|citext)/;
const NUMERIC = /^(integer|bigint|smallint|numeric|real|double precision|money)/;
const TEMPORAL = /^(date|timestamp)/;

export async function sampleTable(db: ClientBase, t: IntroTable, opts: SampleOptions): Promise<Record<string, ColumnStats>> {
  const out: Record<string, ColumnStats> = {};
  if (t.rowEstimate === 0) {
    const c = await db.query(`select count(*)::int as n from ${qi(t.schema)}.${qi(t.name)}`);
    if (c.rows[0].n === 0) return out;
  }
  const from = t.rowEstimate > (opts.sampleAbove ?? 100_000) ? `${qi(t.schema)}.${qi(t.name)} tablesample system (5)` : `${qi(t.schema)}.${qi(t.name)}`;
  for (const col of t.columns) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    if (opts.skip(t, col)) continue;
    const c = qi(col.name);
    const isText = TEXTY.test(col.pgType) || col.enumType !== null;
    const isNum = NUMERIC.test(col.pgType);
    const isTime = TEMPORAL.test(col.pgType);
    if (/json|bytea|tsvector|\[\]/.test(col.pgType)) continue;
    let res;
    try {
      res = await db.query(
        `select count(*)::int as n, count(${c})::int as nn, count(distinct ${c})::int as d
                ${isNum || isTime ? `, min(${c})::text as mn, max(${c})::text as mx` : ''}
           from ${from}`,
      );
    } catch {
      continue; // e.g. no SELECT privilege on this column: skip, RLS/grants decide.
    }
    const row = res.rows[0];
    const n = Number(row.n) || 0;
    const stats: ColumnStats = {
      nullRatio: n ? 1 - Number(row.nn) / n : 0,
      distinct: Number(row.d) || 0,
      min: row.mn ?? null,
      max: row.mx ?? null,
      top: null,
      shape: null,
    };
    if (isText && stats.distinct > 0 && stats.distinct <= 20) {
      const top = await db.query(`select ${c}::text as v, count(*)::int as n from ${from} where ${c} is not null group by 1 order by 2 desc, 1 limit 20`);
      stats.top = top.rows.map((r) => ({ value: r.v as string, count: r.n as number }));
    }
    if (isText && col.enumType === null && stats.distinct > 0) {
      const vals = await db.query(`select ${c}::text as v from ${from} where ${c} is not null limit 25`);
      const shape = { email: 0, phone: 0, saId: 0, url: 0, checked: 0 };
      for (const r of vals.rows) {
        const v = String(r.v);
        shape.checked++;
        if (EMAIL.test(v)) shape.email++;
        if (isPhone(v)) shape.phone++;
        if (isSaIdNumber(v)) shape.saId++;
        if (/^https?:\/\//i.test(v)) shape.url++;
      }
      vals.rows.length = 0; // discard samples immediately
      stats.shape = shape;
    }
    out[col.name] = stats;
  }
  return out;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isPhone(v: string): boolean {
  const s = v.replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(s) || /^0[6-8]\d{8}$/.test(s) || /^27[6-8]\d{8}$/.test(s);
}

/** 13-digit South African ID number: YYMMDD SSSS C A Z with a Luhn check digit. */
export function isSaIdNumber(v: string): boolean {
  const s = v.replace(/\s/g, '');
  if (!/^\d{13}$/.test(s)) return false;
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  return luhn(s);
}

export function luhn(s: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
