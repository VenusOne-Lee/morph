import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { SupabaseLike } from '@morph-reports/spec';
import { createViewerClient, type ViewerUser } from './viewer.js';

export type FixtureName = 'crm' | 'helpdesk' | 'lovable-starter' | 'messy';
export const FIXTURES: FixtureName[] = ['crm', 'helpdesk', 'lovable-starter', 'messy'];

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures');
export const ADMIN_URL = process.env.MORPH_FIXTURES_URL ?? 'postgres://postgres:postgres@127.0.0.1:54329/postgres';

export interface FixtureInfo {
  name: FixtureName;
  description: string;
  users: Record<string, ViewerUser & { name: string }>;
}

export function fixtureInfo(name: FixtureName): FixtureInfo {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name, 'fixture.json'), 'utf8')) as FixtureInfo;
}

function urlFor(db: string, user?: { name: string; password: string }): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${db}`;
  if (user) {
    u.username = user.name;
    u.password = user.password;
  }
  return u.toString();
}

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function ensureTemplate(name: FixtureName): Promise<string> {
  const tpl = `morph_${name.replace(/-/g, '_')}`;
  const exists = await admin(async (c) => (await c.query('select 1 from pg_database where datname = $1', [tpl])).rowCount);
  if (!exists) {
    await admin((c) => c.query(`create database "${tpl}"`));
    const db = new pg.Client({ connectionString: urlFor(tpl) });
    await db.connect();
    try {
      for (const f of ['supabase-shim.sql', `${name}/schema.sql`, `${name}/seed.sql`]) await db.query(readFileSync(join(FIXTURES_DIR, f), 'utf8'));
    } finally {
      await db.end();
    }
  }
  return tpl;
}

export interface FixtureDb {
  name: FixtureName;
  database: string;
  /** Superuser pool: for setup only (migrations, assertions on raw tables). */
  adminPool: pg.Pool;
  /** Connection string for the read-only scan role. */
  scanUrl: string;
  info: FixtureInfo;
  /** A supabase-js compatible client signed in as a fixture user ("rep", "manager"...). */
  as(user: string | null): SupabaseLike;
  exec(sql: string): Promise<void>;
  drop(): Promise<void>;
}

/** Creates a throwaway copy of a fixture database for one test file. */
export async function createFixtureDb(name: FixtureName): Promise<FixtureDb> {
  const tpl = await ensureTemplate(name);
  const database = `${tpl}_t${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  await admin((c) => c.query(`create database "${database}" template "${tpl}"`));
  const adminPool = new pg.Pool({ connectionString: urlFor(database), max: 4 });
  adminPool.on('error', () => undefined); // idle clients are killed when the copy is dropped
  const info = fixtureInfo(name);
  return {
    name,
    database,
    adminPool,
    scanUrl: urlFor(database, { name: 'morph_scan', password: 'morph_scan' }),
    info,
    as(user) {
      if (user === null) return createViewerClient({ pool: adminPool, user: null });
      const u = info.users[user];
      if (!u) throw new Error(`Fixture ${name} has no user "${user}"`);
      return createViewerClient({ pool: adminPool, user: { id: u.id, email: u.email } });
    },
    async exec(sql) {
      await adminPool.query(sql);
    },
    async drop() {
      await adminPool.end();
      await admin((c) => c.query(`drop database if exists "${database}" with (force)`));
    },
  };
}

/** Loads the committed morph/ specs for a fixture (written by `morph init --yes`). */
export function fixtureSpecs(name: FixtureName): { model: unknown; actions: unknown; reports: unknown[] } {
  const dir = join(FIXTURES_DIR, name, 'morph');
  const read = (p: string) => JSON.parse(readFileSync(join(dir, p), 'utf8')) as unknown;
  const reports = readdirSync(join(dir, 'reports'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => read(`reports/${f}`));
  return { model: read('model.json'), actions: read('actions.json'), reports };
}
