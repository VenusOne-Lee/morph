import type { SemanticType } from '@morph-reports/spec';
import { currencyFromName } from '@morph-reports/spec';
import type { IntroColumn, IntroTable } from './introspect.js';
import type { ColumnStats } from './sample.js';
import { piiByName, piiByShape, snake } from './pii.js';

export interface Classification {
  semantic: SemanticType;
  confidence: number;
  reason: string;
  pii: boolean;
  piiReason: string | null;
  currency?: string;
  /** For status_enum: ordered values and where they came from. */
  enumValues?: string[];
  enumSource?: 'pg_enum' | 'check' | 'sampled';
}

export interface ClassifyContext {
  table: IntroTable;
  column: IntroColumn;
  stats?: ColumnStats;
  enumValues?: string[];
  /** FK target if declared or inferred. */
  fkTarget?: { table: string; schema: string; inferred: boolean };
  /** Tables that hold people (users, profiles, agents...). */
  userTables: Set<string>;
}

const OWNER_NAMES = /^(owner|assignee|assigned_to|assigned|user|rep|agent|account_manager|sales_rep|manager|responsible|handler)(_id)?$/;
const STATUS_NAMES = /(^|_)(status|stage|state|phase|step|pipeline_stage|lifecycle)($|_)/;
const MONEY_NAMES = /(^|_)(amount|value|price|total|cost|revenue|budget|fee|balance|mrr|arr|invoice_total|subtotal)($|_)|_(zar|usd|eur|gbp|aud|cad|ngn|kes|inr)(_cents)?$|_cents$/;
const COUNT_NAMES = /(^|_)(count|qty|quantity|num|number_of|seats|units)($|_)/;
const PERCENT_NAMES = /(^|_)(pct|percent|percentage|rate|ratio|probability)($|_)/;
const URL_NAMES = /(^|_)(url|link|website|avatar_url|image_url|href)($|_)/;
const NUMERIC = /^(integer|bigint|smallint|numeric|real|double precision|money)/;
const TEXTY = /^(text|character varying|varchar|character|citext)/;

/** Semantic type classifier (MO-106). Each result carries a confidence and the reason. */
export function classifyColumn(ctx: ClassifyContext): Classification {
  const { table, column, stats } = ctx;
  const name = snake(column.name);
  const type = column.pgType;
  const byName = piiByName(column.name);
  const byShape = byName.pii ? byName : piiByShape(stats);
  const pii = byName.pii || byShape.pii;
  const piiReason = byName.pii ? byName.reason : byShape.reason;
  const base = { pii, piiReason };

  if (table.primaryKey.length === 1 && table.primaryKey[0] === column.name) {
    return { ...base, semantic: 'id', confidence: 1, reason: 'primary key' };
  }

  if (ctx.fkTarget) {
    const toUsers = ctx.userTables.has(ctx.fkTarget.table) || (ctx.fkTarget.schema === 'auth' && ctx.fkTarget.table === 'users');
    if (toUsers || OWNER_NAMES.test(name)) {
      return { ...base, semantic: 'owner_ref', confidence: toUsers ? 0.95 : 0.8, reason: toUsers ? `references ${ctx.fkTarget.table} (people)` : `name "${name}" looks like an owner` };
    }
    return { ...base, semantic: 'fk', confidence: ctx.fkTarget.inferred ? 0.7 : 1, reason: `${ctx.fkTarget.inferred ? 'looks like a reference to' : 'references'} ${ctx.fkTarget.table}` };
  }
  if (OWNER_NAMES.test(name) && /uuid|integer|bigint/.test(type)) {
    return { ...base, semantic: 'owner_ref', confidence: 0.6, reason: `name "${name}" looks like an owner (no foreign key)` };
  }

  if (byShape.kind === 'email') return { ...base, semantic: 'email', confidence: byName.pii ? 0.95 : 0.85, reason: piiReason ?? 'email' };
  if (byShape.kind === 'phone') return { ...base, semantic: 'phone', confidence: byName.pii ? 0.95 : 0.85, reason: piiReason ?? 'phone' };
  if (byShape.kind === 'sa_id_number') return { ...base, semantic: 'sa_id_number', confidence: 0.9, reason: piiReason ?? 'SA ID number' };

  if (column.enumType && ctx.enumValues) {
    if (STATUS_NAMES.test(name) || ctx.enumValues.length <= 12) {
      return { ...base, semantic: 'status_enum', confidence: STATUS_NAMES.test(name) ? 1 : 0.85, reason: `Postgres enum; ${ctx.enumValues.length} values`, enumValues: ctx.enumValues, enumSource: 'pg_enum' };
    }
  }
  if (column.checkValues && column.checkValues.length <= 12 && TEXTY.test(type)) {
    return { ...base, semantic: 'status_enum', confidence: STATUS_NAMES.test(name) ? 0.95 : 0.75, reason: `check constraint lists ${column.checkValues.length} values`, enumValues: column.checkValues, enumSource: 'check' };
  }
  if (TEXTY.test(type) && STATUS_NAMES.test(name) && stats?.top && stats.distinct > 0 && stats.distinct <= 12) {
    return { ...base, semantic: 'status_enum', confidence: 0.7, reason: `name contains "${STATUS_NAMES.exec(name)![2]}"; ${stats.distinct} distinct values`, enumValues: stats.top.map((t) => t.value), enumSource: 'sampled' };
  }

  if (type === 'boolean') return { ...base, semantic: 'boolean', confidence: 1, reason: 'boolean column' };
  if (/^timestamp/.test(type)) return { ...base, semantic: 'datetime', confidence: 1, reason: type };
  if (type === 'date') return { ...base, semantic: 'date', confidence: 1, reason: 'date column' };
  if (/json/.test(type)) return { ...base, semantic: 'json', confidence: 1, reason: type };
  if (NUMERIC.test(type)) {
    if (pii) return { ...base, semantic: 'number', confidence: 0.8, reason: piiReason ?? 'number' };
    if (MONEY_NAMES.test(name) || type === 'money') {
      const currency = currencyFromName(name);
      return { ...base, semantic: 'money', confidence: currency ? 0.95 : 0.85, reason: `name "${name}" looks like money`, ...(currency ? { currency } : {}) };
    }
    if (PERCENT_NAMES.test(name)) return { ...base, semantic: 'percent', confidence: 0.8, reason: `name "${name}" looks like a percentage` };
    if (COUNT_NAMES.test(name)) return { ...base, semantic: 'count', confidence: 0.8, reason: `name "${name}" looks like a count` };
    return { ...base, semantic: 'number', confidence: 0.7, reason: type };
  }
  if (URL_NAMES.test(name) || (stats?.shape && stats.shape.checked > 0 && stats.shape.url / stats.shape.checked > 0.6)) {
    return { ...base, semantic: 'url', confidence: 0.8, reason: 'looks like a URL' };
  }
  if (/uuid/.test(type)) return { ...base, semantic: 'text', confidence: 0.6, reason: 'uuid without a foreign key' };
  return { ...base, semantic: 'text', confidence: 0.6, reason: type };
}

/** Terminal values end a flow: they leave the open pipeline. */
export const TERMINAL = /^(won|lost|closed|closed_won|closed_lost|done|complete|completed|cancelled|canceled|archived|resolved|solved|rejected|delivered|shipped|paid|churned|declined)$/i;

/** People tables: profiles keyed to auth.users, or named like users. */
export function findUserTables(tables: IntroTable[]): Set<string> {
  const out = new Set<string>();
  for (const t of tables) {
    const toAuth = t.foreignKeys.some((f) => f.refSchema === 'auth' && f.refTable === 'users');
    if (toAuth || /^(users|profiles|members|agents|employees|staff|team_members|reps)$/.test(t.name)) out.add(t.name);
  }
  return out;
}
