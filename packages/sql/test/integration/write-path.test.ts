import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyAction,
  actionInfo,
  listAudit,
  payloadFromPreview,
  previewAction,
  undoAction,
  type MorphError,
} from '@morph-reports/spec';
import { CRM, migratedFixture, type MigratedFixture } from './helpers.js';

let fx: MigratedFixture;

beforeAll(async () => {
  fx = await migratedFixture('crm');
});
afterAll(async () => {
  await fx?.db.drop();
});

async function row(id: string) {
  const r = await fx.db.adminPool.query('select stage::text, owner_id::text, stage_changed_at, updated_at from deals where id = $1', [id]);
  return r.rows[0] as { stage: string; owner_id: string; stage_changed_at: Date; updated_at: Date };
}

async function rejects(p: Promise<unknown>): Promise<MorphError> {
  try {
    await p;
  } catch (e) {
    return e as MorphError;
  }
  throw new Error('expected the call to fail');
}

describe('preview (MO-705)', () => {
  it('shows every row and field that would change, and writes nothing', async () => {
    const before = await row(CRM.soweto);
    const p = await previewAction(fx.db.as('rep'), { action: 'deals.stage', ids: [CRM.soweto], to: 'qualified' });
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ id: CRM.soweto, display: 'Soweto Bakers', field: 'stage', before: 'lead', after: 'qualified', skipped: null });
    expect(Object.keys(p.rows[0]!.sideEffects)).toEqual(['stage_changed_at']);
    expect(p.allowed).toBe(1);
    expect(p.changed).toBe(1);
    expect(p.policies).toEqual(['deals_team_update']);
    expect(p.actor).toBe('Sipho N.');
    expect(p.toDisplay).toBe('Qualified');
    expect(await row(CRM.soweto)).toEqual(before);
  });

  it('marks rows that already have the value as skipped', async () => {
    const p = await previewAction(fx.db.as('rep'), { action: 'deals.stage', ids: [CRM.soweto, CRM.limpopo], to: 'lead' });
    expect(p.rows.every((r) => r.skipped === 'already')).toBe(true);
    expect(p.changed).toBe(0);
  });

  it('flags terminal stages', async () => {
    const p = await previewAction(fx.db.as('rep'), { action: 'deals.stage', ids: [CRM.durban], to: 'lost' });
    expect(p.terminal).toBe(true);
  });

  it('reports the dry run blocked by the UPDATE policy (rep cannot hand a deal to someone else)', async () => {
    const p = await previewAction(fx.db.as('rep'), { action: 'deals.owner_id', ids: [CRM.soweto], to: CRM.ayesha });
    expect(p.changed).toBe(1);
    expect(p.allowed).toBe(0);
  });

  it('lets a manager reassign', async () => {
    const p = await previewAction(fx.db.as('manager'), { action: 'deals.owner_id', ids: [CRM.soweto], to: CRM.ayesha });
    expect(p.allowed).toBe(1);
    expect(p.toDisplay).toBe('Ayesha K.');
  });
});

describe('write-path security (MO-719)', () => {
  it('rejects rows the viewer cannot see', async () => {
    const e = await rejects(previewAction(fx.db.as('rep'), { action: 'deals.stage', ids: [CRM.ubuntu], to: 'won' }));
    expect(e.code).toBe('no_permission');
    const e2 = await rejects(applyAction(fx.db.as('rep'), { action: 'deals.stage', ids: [CRM.ubuntu], to: 'won', expected: { [CRM.ubuntu]: { value: 'proposal', version: '1' } } }));
    expect(e2.code).toBe('no_permission');
    expect((await row(CRM.ubuntu)).stage).toBe('proposal');
  });

  it('rejects a column outside the allow-list', async () => {
    const e = await rejects(previewAction(fx.db.as('manager'), { action: 'deals.value_zar', ids: [CRM.soweto], to: '1' }));
    expect(e.code).toBe('unknown_action');
    const e2 = await rejects(previewAction(fx.db.as('manager'), { action: 'users.role', ids: [CRM.sipho], to: 'sales_manager' }));
    expect(e2.code).toBe('unknown_action'); // discovered but disabled
  });

  it('rejects an enum value not in the list', async () => {
    const e = await rejects(previewAction(fx.db.as('manager'), { action: 'deals.stage', ids: [CRM.soweto], to: 'negotiation' }));
    expect(e.code).toBe('value_not_allowed');
  });

  it('rejects an owner the viewer cannot see', async () => {
    const e = await rejects(previewAction(fx.db.as('manager'), { action: 'deals.owner_id', ids: [CRM.soweto], to: '00000000-0000-4000-8000-0000000000ff' }));
    expect(e.code).toBe('target_not_visible');
    const e2 = await rejects(previewAction(fx.db.as('manager'), { action: 'deals.owner_id', ids: [CRM.soweto], to: 'not-a-uuid' }));
    expect(e2.code).toBe('target_not_visible');
  });

  it('rejects apply without a preview', async () => {
    const e = await rejects(applyAction(fx.db.as('rep'), { action: 'deals.stage', ids: [CRM.soweto], to: 'qualified' }));
    expect(e.message).toMatch(/Preview/);
  });

  it('rejects a reassignment the UPDATE policy blocks, with nothing written', async () => {
    const p = await previewAction(fx.db.as('rep'), { action: 'deals.owner_id', ids: [CRM.soweto], to: CRM.ayesha });
    const e = await rejects(applyAction(fx.db.as('rep'), payloadFromPreview(p)));
    expect(e.code).toBe('no_permission');
    expect((await row(CRM.soweto)).owner_id).toBe(CRM.sipho);
    expect(await listAudit(fx.db.as('rep'))).toHaveLength(0);
  });

  it('rejects more rows than bulkMax', async () => {
    const ids = Array.from({ length: 26 }, (_, i) => `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    const e = await rejects(previewAction(fx.db.as('manager'), { action: 'deals.stage', ids, to: 'won' }));
    expect(e.code).toBe('bulk_limit');
  });

  it('refuses anonymous callers', async () => {
    const e = await rejects(previewAction(fx.db.as(null), { action: 'deals.stage', ids: [CRM.soweto], to: 'won' }));
    expect(['no_permission', 'view_missing', 'not_signed_in']).toContain(e.code);
  });

  it('does not let a viewer write audit rows directly', async () => {
    const res = await fx.db.as('rep').rpc('morph__check', {}); // internal helper: wrong args
    expect(res.error).not.toBeNull();
    const client = await fx.db.adminPool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: CRM.sipho })]);
      await expect(client.query(`insert into morph_audit (actor, action, table_name, row_count, rows) values ($1, 'deals.stage', 'deals', 1, '[]')`, [CRM.sipho])).rejects.toThrow(/row-level security/);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});

describe('apply, audit and undo (MO-706 – MO-708, MO-717)', () => {
  it('applies, writes one audit row, and undo restores every field', async () => {
    const rep = fx.db.as('rep');
    const before = await row(CRM.limpopo);
    const p = await previewAction(rep, { action: 'deals.stage', ids: [CRM.limpopo], to: 'qualified' });
    const a = await applyAction(rep, payloadFromPreview(p));
    expect(a.changed).toBe(1);
    const after = await row(CRM.limpopo);
    expect(after.stage).toBe('qualified');
    expect(after.stage_changed_at.getTime()).toBeGreaterThan(before.stage_changed_at.getTime());

    const log = await listAudit(rep);
    expect(log[0]).toMatchObject({ id: a.auditId, action: 'deals.stage', row_count: 1, actor_name: 'Sipho N.', source: 'component', undone_at: null, to_display: 'Qualified' });

    const u = await undoAction(rep, a.auditId);
    expect(u).toMatchObject({ restored: 1, partial: false });
    expect(await row(CRM.limpopo)).toEqual({ ...before, updated_at: (await row(CRM.limpopo)).updated_at });
    expect((await row(CRM.limpopo)).stage_changed_at.getTime()).toBe(before.stage_changed_at.getTime());
    const again = await rejects(undoAction(rep, a.auditId));
    expect(again.code).toBe('already_undone');
  });

  it('rejects a stale preview (row changed since) and replay of an old payload', async () => {
    const mgr = fx.db.as('manager');
    const p = await previewAction(mgr, { action: 'deals.stage', ids: [CRM.karoo], to: 'proposal' });
    await fx.db.exec(`update deals set value_zar = value_zar + 1 where id = '${CRM.karoo}'`);
    const e = await rejects(applyAction(mgr, payloadFromPreview(p)));
    expect(e.code).toBe('conflict');
    expect((e.details as { display: string }[])[0]!.display).toBe('Karoo Solar Co-op');
    expect((await row(CRM.karoo)).stage).toBe('qualified');

    const p2 = await previewAction(mgr, { action: 'deals.stage', ids: [CRM.karoo], to: 'proposal' });
    const ok = await applyAction(mgr, payloadFromPreview(p2));
    const replay = await rejects(applyAction(mgr, payloadFromPreview(p2)));
    expect(replay.code).toBe('conflict');
    await undoAction(mgr, ok.auditId);
  });

  it('is all or nothing across rows', async () => {
    const mgr = fx.db.as('manager');
    const p = await previewAction(mgr, { action: 'deals.stage', ids: [CRM.soweto, CRM.durban], to: 'won' });
    await fx.db.exec(`update deals set value_zar = value_zar + 1 where id = '${CRM.durban}'`);
    await rejects(applyAction(mgr, payloadFromPreview(p)));
    expect((await row(CRM.soweto)).stage).toBe('lead');
  });

  it("can't undo someone else's action", async () => {
    const rep = fx.db.as('rep');
    const p = await previewAction(rep, { action: 'deals.stage', ids: [CRM.soweto], to: 'qualified' });
    const a = await applyAction(rep, payloadFromPreview(p));
    const e = await rejects(undoAction(fx.db.as('manager'), a.auditId));
    expect(e.message).toMatch(/isn't in your log/);
    expect((await listAudit(fx.db.as('manager'))).some((x) => x.id === a.auditId)).toBe(false);
    await undoAction(rep, a.auditId);
  });

  it('stops undo when a row changed since, then allows partial undo', async () => {
    const mgr = fx.db.as('manager');
    const p = await previewAction(mgr, { action: 'deals.owner_id', ids: [CRM.soweto, CRM.limpopo], to: CRM.ayesha });
    const a = await applyAction(mgr, payloadFromPreview(p));
    const p2 = await previewAction(mgr, { action: 'deals.owner_id', ids: [CRM.soweto], to: CRM.pieter });
    await applyAction(mgr, payloadFromPreview(p2));

    const e = await rejects(undoAction(mgr, a.auditId));
    expect(e.code).toBe('conflict');
    const conflicts = e.details as { display: string; changedBy: string | null }[];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ display: 'Soweto Bakers', changedBy: 'Thandi M.' });
    expect((await row(CRM.limpopo)).owner_id).toBe(CRM.ayesha);

    const u = await undoAction(mgr, a.auditId, { partial: true });
    expect(u).toMatchObject({ restored: 1, partial: true });
    expect((await row(CRM.limpopo)).owner_id).toBe(CRM.sipho);
    expect((await row(CRM.soweto)).owner_id).toBe(CRM.pieter);
    await fx.db.exec(`update deals set owner_id = '${CRM.sipho}' where id = '${CRM.soweto}'`);
  });

  it('closes the undo window after 30 days', async () => {
    const rep = fx.db.as('rep');
    const p = await previewAction(rep, { action: 'deals.stage', ids: [CRM.soweto], to: 'qualified' });
    const a = await applyAction(rep, payloadFromPreview(p));
    await fx.db.exec(`update morph_audit set created_at = now() - interval '31 days' where id = '${a.auditId}'`);
    const e = await rejects(undoAction(rep, a.auditId));
    expect(e.code).toBe('undo_window_closed');
    await fx.db.exec(`update deals set stage = 'lead' where id = '${CRM.soweto}'`);
  });

  it('records MCP as the source', async () => {
    const rep = fx.db.as('rep');
    const p = await previewAction(rep, { action: 'deals.stage', ids: [CRM.soweto], to: 'qualified' });
    const a = await applyAction(rep, payloadFromPreview(p), 'mcp');
    expect((await listAudit(rep)).find((x) => x.id === a.auditId)?.source).toBe('mcp');
    await undoAction(rep, a.auditId);
  });
});

describe('permission probe (MO-704)', () => {
  it('says whether the viewer can use an action', async () => {
    expect(await actionInfo(fx.db.as('rep'), 'deals.stage')).toMatchObject({ canAct: true, policies: ['deals_team_update'] });
    expect(await actionInfo(fx.db.as('rep'), 'users.role')).toMatchObject({ canAct: false });
  });
});
