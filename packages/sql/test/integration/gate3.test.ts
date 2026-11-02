/**
 * Gate 3 (MO-720): every apply/undo pair across fixtures restores every
 * field, and every write respects RLS. Run with `pnpm test:gate3`.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { applyAction, payloadFromPreview, previewAction, undoAction, type ActionSpec } from '@morph-reports/spec';
import { migratedFixture, type MigratedFixture } from './helpers.js';
import type { FixtureName } from '@morph-reports/testkit';

const opened: MigratedFixture[] = [];
afterAll(async () => {
  await Promise.all(opened.map((f) => f.db.drop()));
});

async function snapshot(fx: MigratedFixture, table: string): Promise<string> {
  const r = await fx.db.adminPool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by t::text), '[]') as s from public."${table}" t`);
  return JSON.stringify(r.rows[0].s);
}

async function targetValue(fx: MigratedFixture, a: ActionSpec, current: unknown, viewer: string): Promise<string | null> {
  if (a.kind === 'set_enum') return (a.values ?? []).find((v) => v !== current) ?? null;
  const t = fx.project.model.entities[a.target!.entity]!;
  const { data } = await fx.db.as(viewer).from(t.name).select(a.target!.field).limit(10);
  const ids = ((data ?? []) as Record<string, unknown>[]).map((r) => String(r[a.target!.field]));
  return ids.find((x) => x !== String(current)) ?? null;
}

const FIXTURES: FixtureName[] = ['crm', 'helpdesk', 'lovable-starter'];

describe.each(FIXTURES)('gate 3 on %s', (name) => {
  it('every enabled action: apply then undo restores the table byte for byte', async () => {
    const fx = await migratedFixture(name);
    opened.push(fx);
    const viewer = 'manager';
    let pairs = 0;
    for (const a of fx.project.actions.actions.filter((x) => x.enabled)) {
      const ent = fx.project.model.entities[a.table]!;
      const { data } = await fx.db.as(viewer).from(a.table).select(`${ent.primaryKey},${a.column}`).limit(3);
      const rows = (data ?? []) as Record<string, unknown>[];
      if (!rows.length) continue;
      const to = await targetValue(fx, a, rows[0]![a.column], viewer);
      if (!to) continue;
      const before = await snapshot(fx, a.table);
      const ids = rows.map((r) => String(r[ent.primaryKey!]));
      const p = await previewAction(fx.db.as(viewer), { action: a.id, ids, to });
      if (p.allowed < p.changed || p.changed === 0) continue; // policy says no: covered by the security tests
      const applied = await applyAction(fx.db.as(viewer), payloadFromPreview(p));
      expect(await snapshot(fx, a.table)).not.toBe(before);
      await undoAction(fx.db.as(viewer), applied.auditId);
      expect(await snapshot(fx, a.table), `${a.id} on ${name}`).toBe(before);
      pairs++;
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it('no viewer can write past RLS: an outsider changes nothing', async () => {
    const fx = await migratedFixture(name);
    opened.push(fx);
    const outsider = fx.db.info.users.outsider ? 'outsider' : 'rep';
    for (const a of fx.project.actions.actions.filter((x) => x.enabled)) {
      const ent = fx.project.model.entities[a.table]!;
      const all = await fx.db.adminPool.query(`select "${ent.primaryKey}"::text as id from public."${a.table}"`);
      const visible = await fx.db.as(outsider).from(a.table).select(ent.primaryKey!);
      const seen = new Set(((visible.data ?? []) as Record<string, unknown>[]).map((r) => String(r[ent.primaryKey!])));
      const hidden = all.rows.map((r) => r.id as string).filter((id) => !seen.has(id)).slice(0, 3);
      if (!hidden.length) continue;
      const before = await snapshot(fx, a.table);
      const to = a.kind === 'set_enum' ? a.values![0]! : fx.db.info.users.manager!.id;
      await expect(applyAction(fx.db.as(outsider), { action: a.id, ids: hidden, to, expected: Object.fromEntries(hidden.map((id) => [id, { value: null, version: '0' }])) })).rejects.toBeTruthy();
      expect(await snapshot(fx, a.table)).toBe(before);
    }
  });
});
