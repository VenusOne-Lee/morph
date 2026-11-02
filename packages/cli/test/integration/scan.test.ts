import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixtureDb, findServiceRoleUsage, type FixtureDb, type FixtureName } from '@morph-reports/testkit';
import { generateReports, main, memoryIo, scanDatabase } from '../../src/index.js';

const dbs: Partial<Record<FixtureName, FixtureDb>> = {};
beforeAll(async () => {
  for (const f of ['crm', 'helpdesk', 'lovable-starter', 'messy'] as FixtureName[]) dbs[f] = await createFixtureDb(f);
});
afterAll(async () => {
  await Promise.all(Object.values(dbs).map((d) => d!.drop()));
});

const superUrl = (db: FixtureDb) => db.scanUrl.replace('morph_scan:morph_scan', 'postgres:postgres');

describe('scan (E1)', () => {
  it('scans the CRM like the prototype: RLS, PII, enums, owners', async () => {
    const r = await scanDatabase({ url: dbs.crm!.scanUrl });
    expect(r.counts.tables).toBe(7);
    expect(r.notes.rlsOff).toEqual(['invoices']);
    expect(r.notes.rlsNoPolicies).toEqual(['activities']);
    expect(r.notes.pii.sort()).toEqual(['contacts.email', 'contacts.id_number', 'contacts.phone', 'users.email']);
    expect(r.model.entities.invoices!.exposed).toBe(false);
    const deals = r.model.entities.deals!;
    expect(deals.fields.stage).toMatchObject({ semantic: 'status_enum', enum: 'deal_stage', exposed: true });
    expect(deals.fields.owner_id).toMatchObject({ semantic: 'owner_ref', references: { entity: 'users', field: 'id', inferred: false } });
    expect(deals.fields.value_zar).toMatchObject({ semantic: 'money', currency: 'ZAR' });
    expect(r.model.enums.deal_stage).toMatchObject({ values: ['lead', 'qualified', 'proposal', 'won', 'lost'], terminal: ['won', 'lost'] });
    expect(r.actions.actions.filter((a) => a.enabled).map((a) => a.id).sort()).toEqual(['deals.owner_id', 'deals.stage']);
    expect(r.actions.actions.find((a) => a.id === 'deals.stage')!.sideEffects).toEqual([{ set: 'stage_changed_at', to: 'now()' }]);
    expect(r.timings.total).toBeLessThan(60_000);
  });

  it('refuses a role that bypasses RLS without --allow-superuser (MO-102)', async () => {
    await expect(scanDatabase({ url: superUrl(dbs.crm!) })).rejects.toMatchObject({ code: 'unsafe_config' });
  });

  it('runs every query read-only', async () => {
    const before = await dbs.crm!.adminPool.query('select count(*)::int as n from deals');
    await scanDatabase({ url: superUrl(dbs.crm!), allowSuperuser: true });
    const after = await dbs.crm!.adminPool.query('select count(*)::int as n from deals');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('handles the Lovable starter: text statuses from check constraints', async () => {
    const r = await scanDatabase({ url: dbs['lovable-starter']!.scanUrl });
    expect(r.model.entities.tasks!.fields.status).toMatchObject({ semantic: 'status_enum' });
    expect(r.model.enums.tasks_status!.values).toEqual(['todo', 'in_progress', 'review', 'done']);
    expect(r.model.entities.tasks!.fields.assignee_id!.semantic).toBe('owner_ref');
    expect(r.model.entities.profiles!.fields.email!.pii).toBe(true);
  });

  it('handles the messy fixture: inferred joins, mixed case, no PK, RLS off', async () => {
    const r = await scanDatabase({ url: superUrl(dbs.messy!), allowSuperuser: true });
    expect(r.notes.rlsOff).toEqual(['legacy_export']);
    expect(r.notes.rlsNoPolicies).toEqual(['audit_trail']);
    expect(r.notes.noPrimaryKey).toEqual(['notes']);
    expect(r.notes.mixedCaseEnums).toEqual(['orders.status']);
    expect(r.model.joins).toContainEqual({ from: 'orders.customer_id', to: 'customers.id', inferred: true });
    expect(r.model.entities.customers!.fields.dob!.pii).toBe(true);
    expect(r.actions.actions.find((a) => a.id === 'orders.status')?.enabled).toBe(false);
  });
});

describe('auto reports (MO-311)', () => {
  it.each([
    ['crm', 4],
    ['lovable-starter', 4],
    ['helpdesk', 4],
  ] as const)('generates at least %s… reports on %s', async (name, min) => {
    const r = await scanDatabase({ url: dbs[name]!.scanUrl });
    const reps = generateReports(r.model, r.actions);
    expect(reps.length).toBeGreaterThanOrEqual(min);
    expect(reps.length).toBeLessThanOrEqual(8);
    expect(new Set(reps.map((c) => c.spec.id)).size).toBe(reps.length);
  });
  it('generates at least 2 on messy', async () => {
    const r = await scanDatabase({ url: superUrl(dbs.messy!), allowSuperuser: true });
    expect(generateReports(r.model, r.actions).length).toBeGreaterThanOrEqual(2);
  });
  it('produces the prototype reports on the CRM', async () => {
    const r = await scanDatabase({ url: dbs.crm!.scanUrl });
    const ids = generateReports(r.model, r.actions).map((c) => c.spec.id);
    expect(ids).toEqual(expect.arrayContaining(['deals-by-stage', 'stuck-deals', 'deals-by-owner', 'won-deals-by-month']));
  });
});

describe('morph init --yes (MO-101, MO-113, MO-114)', () => {
  it('writes morph/ and one migration, and the migration applies cleanly', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'morph-init-'));
    const io = memoryIo();
    const code = await main(['init', '--yes', '--url', dbs.crm!.scanUrl, '--cwd', cwd], io);
    expect(code).toBe(0);
    expect(io.lines.join('\n')).toContain('✓ 7 tables, 41 columns, 8 foreign keys');
    expect(io.lines.join('\n')).toContain('invoices has RLS off, hidden until you turn RLS on');
    expect(io.lines.join('\n')).toMatch(/→ \d reports and 2 actions ready/);
    expect(readdirSync(join(cwd, 'morph', 'reports')).length).toBeGreaterThanOrEqual(4);
    const [mig] = readdirSync(join(cwd, 'supabase', 'migrations'));
    expect(mig).toMatch(/^\d{14}_morph\.sql$/);
    const sql = readFileSync(join(cwd, 'supabase', 'migrations', mig!), 'utf8');
    expect(sql).not.toContain(dbs.crm!.scanUrl);
    await dbs.crm!.exec(sql);
    await dbs.crm!.exec(sql); // idempotent

    const doc = memoryIo();
    const dcode = await main(['doctor', '--url', dbs.crm!.scanUrl, '--cwd', cwd], doc);
    expect(doc.lines.join('\n')).toContain('Migration applied');
    expect(dcode).toBe(0);
  });

  it('--dry-run writes nothing; bad connection exits 2; superuser exits 3', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'morph-dry-'));
    expect(await main(['init', '--yes', '--dry-run', '--url', dbs.crm!.scanUrl, '--cwd', cwd], memoryIo())).toBe(0);
    expect(readdirSync(cwd)).toEqual([]);
    expect(await main(['init', '--yes', '--url', 'postgres://nobody:x@127.0.0.1:1/none', '--cwd', cwd], memoryIo())).toBe(2);
    expect(await main(['init', '--yes', '--url', superUrl(dbs.crm!), '--cwd', cwd], memoryIo())).toBe(3);
  });

  it('morph diff reports schema changes and marks broken reports (MO-115)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'morph-diff-'));
    await main(['init', '--yes', '--url', dbs.helpdesk!.scanUrl, '--cwd', cwd], memoryIo());
    await dbs.helpdesk!.exec(`alter table tickets add column channel text; alter type ticket_status add value 'escalated'`);
    const io = memoryIo();
    await main(['diff', '--url', dbs.helpdesk!.scanUrl, '--cwd', cwd], io);
    const out = io.lines.join('\n');
    expect(out).toContain('+ tickets.channel');
    expect(out).toContain('enum ticket_status: +escalated');

    await dbs.helpdesk!.exec(`alter table tickets rename column subject to title`);
    const io2 = memoryIo();
    await main(['scan', '--yes', '--url', dbs.helpdesk!.scanUrl, '--cwd', cwd], io2);
    expect(io2.lines.join('\n')).toMatch(/Report .* is now broken/);
    const reports = readdirSync(join(cwd, 'morph', 'reports')).map((f) => JSON.parse(readFileSync(join(cwd, 'morph', 'reports', f), 'utf8')));
    expect(reports.some((r) => r.broken)).toBe(true);
  });

  it('doctor flags a service-role key in .env', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'morph-doc-'));
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    writeFileSync(join(cwd, '.env'), `SECRET_THING=eyJhbGciOiJIUzI1NiJ9.${payload}.c2lnbmF0dXJlMTIz\n`);
    const io = memoryIo();
    expect(await main(['doctor', '--url', dbs.crm!.scanUrl, '--cwd', cwd], io)).toBe(1);
    expect(io.lines.join('\n')).toContain('Remove the service-role key from .env: SECRET_THING');
  });
});

describe('principle 1: no service-role key in runtime code (MO-006)', () => {
  it('runtime packages never mention it', () => {
    const root = join(__dirname, '..', '..', '..');
    expect(findServiceRoleUsage(['spec', 'react', 'mcp', 'sql'].map((p) => join(root, p, 'src')).filter((p) => { try { readdirSync(p); return true; } catch { return false; } }))).toEqual([]);
  });
});
