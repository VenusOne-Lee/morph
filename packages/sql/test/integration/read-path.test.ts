import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aggregate, compileQuery, fetchReportRows, resolveReport, type MorphError } from '@morph-reports/spec';
import { migratedFixture, type MigratedFixture } from './helpers.js';

let fx: MigratedFixture;
beforeAll(async () => {
  fx = await migratedFixture('crm');
});
afterAll(async () => {
  await fx?.db.drop();
});

const report = (id: string) => resolveReport(fx.project.reports.find((r) => r.id === id)!, fx.project.model, fx.project.actions);

describe('report views run as the viewer (MO-402)', () => {
  it('manager sees the whole team: 15 open deals, R 3.47m', async () => {
    const r = report('deals-by-stage');
    const { rows } = await fetchReportRows(fx.db.as('manager'), compileQuery(r));
    expect(rows).toHaveLength(15);
    const agg = aggregate(rows, { groupBy: ['stage'], measures: [{ fn: 'count' }, { fn: 'sum', column: 'value_zar' }], order: { stage: ['lead', 'qualified', 'proposal'] } });
    expect(agg.groups.map((g) => [g.key, g.count])).toEqual([['lead', 5], ['qualified', 5], ['proposal', 5]]);
    expect(agg.groups[2]!.values.sum_value_zar).toBe(1854000);
    expect(agg.totals.sum_value_zar).toBe(3474000);
  });

  it('a rep sees only their own deals', async () => {
    const { rows } = await fetchReportRows(fx.db.as('rep'), compileQuery(report('deals-by-stage')));
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.owner))).toEqual(new Set(['Sipho N.']));
  });

  it('anon sees nothing (no grant on the view)', async () => {
    await expect(fetchReportRows(fx.db.as(null), compileQuery(report('deals-by-stage')))).rejects.toMatchObject({ code: 'no_permission' } satisfies Partial<MorphError>);
  });

  it('stuck deals: 9 for the manager, oldest first', async () => {
    const { rows } = await fetchReportRows(fx.db.as('manager'), compileQuery(report('stuck-deals')));
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ name: 'Polokwane Pharmacy', days_in_stage: 36 });
  });

  it('applies viewer filters through the query builder, not SQL text', async () => {
    const q = compileQuery(report('deals-by-stage'), [
      { field: 'deals.stage', op: 'in', value: ['proposal'] },
      { field: 'owner', op: '=', value: "Thandi M.'; drop table deals; --" },
    ]);
    const { rows } = await fetchReportRows(fx.db.as('manager'), q);
    expect(rows).toHaveLength(0);
    const ok = await fetchReportRows(fx.db.as('manager'), compileQuery(report('deals-by-stage'), [{ field: 'owner', op: '=', value: 'Thandi M.' }, { field: 'deals.stage', op: 'not_in', value: ['lead', 'qualified'] }]));
    expect(ok.rows.map((r) => r.name).sort()).toEqual(['Msunduzi Clinics', 'Ubuntu Freight']);
  });

  it('caps rows and says so (MO-410)', async () => {
    const res = await fetchReportRows(fx.db.as('manager'), compileQuery(report('deals-by-stage')), { cap: 10, pageSize: 4 });
    expect(res.rows).toHaveLength(10);
    expect(res.capped).toBe(true);
  });

  it('every generated view compiles and only exposes allowed columns', async () => {
    for (const spec of fx.project.reports) {
      const r = resolveReport(spec, fx.project.model, fx.project.actions);
      const cols = await fx.db.adminPool.query(`select column_name from information_schema.columns where table_name = $1`, [r.view]);
      const names = cols.rows.map((c) => c.column_name as string);
      expect(names).not.toContain('email');
      expect(names).not.toContain('phone');
      expect(names).not.toContain('id_number');
    }
  });

  it('reports a missing view clearly', async () => {
    await expect(fetchReportRows(fx.db.as('manager'), { ...compileQuery(report('deals-by-stage')), view: 'morph_r_missing' })).rejects.toMatchObject({ code: 'view_missing' });
  });
});
