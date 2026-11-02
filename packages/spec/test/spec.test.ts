import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aggregate,
  bucketIndex,
  compileQuery,
  compileViewSql,
  formatMoney,
  formatCompact,
  interpolate,
  loadProject,
  matchesFilter,
  migrateSpec,
  niceTicks,
  parseFieldExpr,
  redact,
  resolveReport,
  sortRows,
  validateReport,
  type ReportSpec,
} from '../src/index.js';

const FX = join(__dirname, '..', '..', '..', 'fixtures');
function project(name: string) {
  const dir = join(FX, name, 'morph');
  const read = (p: string) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
  return loadProject({ model: read('model.json'), actions: read('actions.json'), reports: readdirSync(join(dir, 'reports')).sort().map((f) => read(`reports/${f}`)) });
}
const crm = project('crm');
const stuck = () => structuredClone(crm.reports.find((r) => r.id === 'stuck-deals')!) as ReportSpec;

describe('field refs', () => {
  it('parses aliases and derived keys', () => {
    expect(parseFieldExpr('users.name as owner', 'deals')).toMatchObject({ entity: 'users', field: 'name', alias: 'owner' });
    expect(parseFieldExpr('companies.name', 'deals').alias).toBe('companies_name');
    expect(parseFieldExpr('deals.name', 'deals').alias).toBe('name');
    expect(parseFieldExpr('days_in_stage', 'deals', ['days_in_stage']).derived).toBe(true);
    expect(() => parseFieldExpr('drop table', 'deals')).toThrow();
  });
});

describe('validation against the model (MO-203)', () => {
  it('accepts every generated report', () => {
    for (const r of crm.reports) expect(validateReport(r, crm.model, crm.actions)).toEqual({ ok: true, issues: [] });
  });
  it('rejects PII, unknown fields, unknown joins, bad measures and unknown actions', () => {
    const r = stuck();
    r.fields.push('contacts.email');
    r.joins!.push('deals.company_id -> invoices.id');
    r.measures!.push({ fn: 'sum', field: 'deals.name' });
    r.actions!.push('deals.value_zar');
    const v = validateReport(r, crm.model, crm.actions);
    expect(v.ok).toBe(false);
    const text = v.issues.map((i) => i.message).join('\n');
    expect(text).toMatch(/not a join in the model/);
    expect(text).toMatch(/contacts is not the source or a joined table/);
    expect(text).toMatch(/sum needs a number field/);
    expect(text).toMatch(/not in actions.json/);
  });
  it('blocks a source with RLS off', () => {
    const r = { ...stuck(), source: 'invoices', fields: ['invoices.amount_zar'], joins: [], filters: [], groupBy: [], groupByOptions: [], measures: [], sort: [], actions: [], derived: {} };
    expect(validateReport(r, crm.model).issues[0]!.message).toMatch(/RLS off/);
  });
  it('refuses future spec versions', () => {
    expect(() => migrateSpec({ specVersion: 3 })).toThrow(/version 3/);
  });
});

describe('view compiler (MO-205)', () => {
  it('compiles a security_invoker view with quoted identifiers and escaped literals', () => {
    const r = stuck();
    r.filters!.push({ field: 'deals.name', op: '!=', value: "O'Brien" });
    const sql = compileViewSql(resolveReport(r, crm.model, crm.actions));
    expect(sql).toContain('with (security_invoker = true)');
    expect(sql).toContain(`"deals"."name" is distinct from 'O''Brien'`);
    expect(sql).toContain('(current_date - "deals"."stage_changed_at"::date) as "days_in_stage"');
    expect(sql).toContain('grant select on "public"."morph_r_stuck_deals" to authenticated;');
    expect(sql).toContain('revoke all on "public"."morph_r_stuck_deals" from public, anon;');
    expect(sql).not.toMatch(/email|phone|id_number/);
  });
  it('matches snapshots for every generated report', () => {
    for (const spec of crm.reports) expect(compileViewSql(resolveReport(spec, crm.model, crm.actions))).toMatchSnapshot(spec.id);
  });
  it('compiles runtime filters to view columns', () => {
    const q = compileQuery(resolveReport(stuck(), crm.model, crm.actions), [{ field: 'deals.stage', op: '=', value: 'lead' }, { field: 'owner', op: '=', value: 'Sipho N.' }]);
    expect(q.filters).toEqual([{ column: 'stage', op: '=', value: 'lead' }, { column: 'owner', op: '=', value: 'Sipho N.' }]);
    expect(q.order).toEqual([{ field: 'days_in_stage', dir: 'desc' }]);
    expect(q.columns).toContain('_morph_id');
    expect(q.columns).toContain('owner_id');
  });
});

describe('aggregation (MO-207)', () => {
  const rows = [
    { stage: 'lead', owner: 'A', v: 10 },
    { stage: 'proposal', owner: 'A', v: 30 },
    { stage: 'lead', owner: 'B', v: 5 },
    { stage: null, owner: 'C', v: null },
  ];
  it('groups in enum order with empty groups, subtotals and totals', () => {
    const a = aggregate(rows, { groupBy: ['stage', 'owner'], measures: [{ fn: 'count' }, { fn: 'sum', column: 'v' }, { fn: 'avg', column: 'v' }], order: { stage: ['lead', 'qualified', 'proposal'] } });
    expect(a.groups.map((g) => g.key)).toEqual(['lead', 'qualified', 'proposal', '(none)']);
    expect(a.groups[0]!.values).toMatchObject({ count: 2, sum_v: 15, avg_v: 7.5 });
    expect(a.groups[1]!.count).toBe(0);
    expect(a.groups[0]!.children!.map((c) => c.key)).toEqual(['A', 'B']);
    expect(a.totals).toMatchObject({ count: 4, sum_v: 45 });
  });
  it('folds the tail into Other', () => {
    const a = aggregate(rows, { groupBy: ['owner'], topN: 1, sortBy: { measure: 'count', dir: 'desc' } });
    expect(a.groups.map((g) => [g.key, g.count])).toEqual([['A', 2], ['Other', 2]]);
  });
  it('aggregates 50k rows in under 150ms', () => {
    const big = Array.from({ length: 50_000 }, (_, i) => ({ stage: ['lead', 'qualified', 'proposal'][i % 3], owner: `O${i % 40}`, v: i }));
    // Best of three, so a busy CI machine doesn't fail the budget on one slow run.
    const times = [0, 1, 2].map(() => {
      const t0 = performance.now();
      aggregate(big, { groupBy: ['stage', 'owner'], measures: [{ fn: 'count' }, { fn: 'sum', column: 'v' }, { fn: 'max', column: 'v' }] });
      return performance.now() - t0;
    });
    expect(Math.min(...times)).toBeLessThan(150);
  });
  it('buckets and sorts', () => {
    expect([3, 7, 8, 14, 15, 31].map((n) => bucketIndex(n, [7, 14, 30]))).toEqual([0, 0, 1, 1, 2, 3]);
    expect(sortRows([{ d: 1 }, { d: null }, { d: 5 }], [{ field: 'd', dir: 'desc' }]).map((r) => r.d)).toEqual([5, 1, null]);
  });
  it('filters rows in memory the same way', () => {
    expect(matchesFilter({ s: 'lead' }, { column: 's', op: 'not_in', value: ['won', 'lost'] })).toBe(true);
    expect(matchesFilter({ d: 15 }, { column: 'd', op: '>', value: 14 })).toBe(true);
  });
});

describe('formatting (MO-208)', () => {
  it('formats rand like the prototype', () => {
    expect(formatMoney(1854000, 'ZAR')).toBe('R 1.85m');
    expect(formatMoney(420000, 'ZAR')).toBe('R 420k');
    expect(formatMoney(1000000, 'ZAR')).toBe('R 1m');
    expect(formatCompact(-2500)).toBe('−3k');
  });
  it('makes nice axis ticks', () => {
    expect(niceTicks(1854000)).toEqual([0, 500000, 1000000, 1500000, 2000000]);
  });
  it('interpolates copy with plurals', () => {
    expect(interpolate('Move {count} [deal|deals]', { count: 1 })).toBe('Move 1 deal');
    expect(interpolate('Move {count} [deal|deals]', { count: 3 })).toBe('Move 3 deals');
  });
});

describe('redaction (MO-008)', () => {
  it('never logs row values or credentials', () => {
    const out = redact({ action: 'deals.stage', rows: [{ id: 1 }], expected: { a: 1 }, url: 'postgres://u:p@h/db', note: 'see postgres://x:y@h/d', apikey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abcdefghijk' });
    expect(JSON.stringify(out)).not.toMatch(/u:p|x:y|eyJ|"id":1/);
    expect(out).toMatchObject({ action: 'deals.stage', rows: '[1 redacted]' });
  });
});
