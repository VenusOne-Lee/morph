/* eslint-disable @typescript-eslint/no-explicit-any -- test helpers read loose JSON */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadProject } from '@morph-reports/spec';
import { createFixtureDb, fixtureSpecs, FIXTURES_DIR, type FixtureDb } from '@morph-reports/testkit';
import { assertPublicKey, createMorphServer, PREVIEW_TTL_MS, readProject } from '../src/index.js';

let db: FixtureDb;
const project = loadProject(fixtureSpecs('crm'));
const SOWETO = '30000000-0000-4000-8000-000000000004';

beforeAll(async () => {
  db = await createFixtureDb('crm');
  const dir = join(FIXTURES_DIR, 'crm', 'supabase', 'migrations');
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
});
afterAll(async () => {
  await db?.drop();
});

async function connect(user: string, now?: () => number) {
  const { server } = createMorphServer({ project, client: db.as(user), ...(now ? { now } : {}) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent?: Record<string, unknown>; content: { text: string }[] };
    return { error: !!r.isError, data: (r.structuredContent ?? JSON.parse(r.content[0]!.text)) as Record<string, any>, text: r.content[0]!.text };
  };
  return { client, call };
}

describe('Morph MCP server', () => {
  it('exposes five tools with read-only and destructive hints', async () => {
    const { client } = await connect('manager');
    const { tools } = await client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    expect(Object.keys(by).sort()).toEqual(['apply_action', 'list_reports', 'preview_action', 'run_report', 'undo']);
    expect(by.list_reports?.readOnlyHint).toBe(true);
    expect(by.run_report?.readOnlyHint).toBe(true);
    expect(by.preview_action?.readOnlyHint).toBe(true);
    expect(by.apply_action?.destructiveHint).toBe(true);
    expect(by.undo?.destructiveHint).toBe(true);
  });

  it('lists reports with columns and allowed actions', async () => {
    const { call } = await connect('manager');
    const { data } = await call('list_reports');
    const stage = data.reports.find((r: { id: string }) => r.id === 'deals-by-stage');
    expect(stage.actions).toEqual(expect.arrayContaining(['deals.stage', 'deals.owner_id']));
    expect(stage.columns.map((c: { field: string }) => c.field)).toContain('name');
    expect(data.actions.map((a: { id: string }) => a.id).sort()).toEqual(['deals.owner_id', 'deals.stage']);
  });

  it('runs a report under RLS: a rep sees fewer deals than the manager', async () => {
    const m = await (await connect('manager')).call('run_report', { report: 'deals-by-stage' });
    const r = await (await connect('rep')).call('run_report', { report: 'deals-by-stage' });
    expect(m.data.rowCount).toBe(15);
    expect(m.data.capped).toBe(false);
    expect(r.data.rowCount).toBeGreaterThan(0);
    expect(r.data.rowCount).toBeLessThan(15);
    expect(m.data.groups.length).toBeGreaterThan(1);
  });

  it('previews, applies once, and undoes', async () => {
    const { call } = await connect('manager');
    const p = await call('preview_action', { action: 'deals.stage', ids: [SOWETO], to: 'qualified' });
    expect(p.error).toBe(false);
    expect(p.data.changed).toBe(1);
    expect(p.text).toMatch(/^Preview: move 1 deal from Lead to Qualified. Nothing has been written/);
    expect((await db.adminPool.query('select stage from deals where id = $1', [SOWETO])).rows[0].stage).toBe('lead');

    const a = await call('apply_action', { preview_id: p.data.preview_id });
    expect(a.error).toBe(false);
    expect((await db.adminPool.query('select stage from deals where id = $1', [SOWETO])).rows[0].stage).toBe('qualified');
    const audit = await db.adminPool.query('select source from morph_audit where id = $1', [a.data.audit_id]);
    expect(audit.rows[0].source).toBe('mcp');

    const again = await call('apply_action', { preview_id: p.data.preview_id });
    expect(again.error).toBe(true);

    const u = await call('undo', { audit_id: a.data.audit_id });
    expect(u.error).toBe(false);
    expect(u.data.restored).toBe(1);
    expect((await db.adminPool.query('select stage from deals where id = $1', [SOWETO])).rows[0].stage).toBe('lead');
  });

  it('refuses unknown or expired previews', async () => {
    let t = 1_000_000;
    const { call } = await connect('manager', () => t);
    expect((await call('apply_action', { preview_id: 'nope' })).error).toBe(true);
    const p = await call('preview_action', { action: 'deals.stage', ids: [SOWETO], to: 'qualified' });
    t += PREVIEW_TTL_MS + 1;
    const a = await call('apply_action', { preview_id: p.data.preview_id });
    expect(a.error).toBe(true);
    expect(a.data.error.message).toMatch(/expired/);
  });

  it('a rep cannot preview a change to a deal they cannot see', async () => {
    const { call } = await connect('rep2');
    const p = await call('preview_action', { action: 'deals.stage', ids: [SOWETO], to: 'qualified' });
    expect(p.error || p.data.allowed === 0).toBe(true);
  });

  it('returns a plain error for an unknown report', async () => {
    const { call } = await connect('manager');
    const r = await call('run_report', { report: 'nope' });
    expect(r.error).toBe(true);
    expect(r.data.error.code).toBe('unknown_report');
  });
});

describe('keys and project loading', () => {
  const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;
  it('refuses keys that bypass RLS', () => {
    expect(() => assertPublicKey(jwt('service_role'))).toThrow(/bypasses row level security/);
    expect(() => assertPublicKey('sb_secret_abc')).toThrow();
    expect(() => assertPublicKey(jwt('anon'))).not.toThrow();
    expect(() => assertPublicKey('sb_publishable_abc')).not.toThrow();
  });
  it('reads a project folder', () => {
    expect(readProject(join(FIXTURES_DIR, 'crm')).reports.length).toBe(8);
  });
});
