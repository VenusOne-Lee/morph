#!/usr/bin/env node
// pnpm fixtures:up | fixtures:reset
// Creates the four fixture databases (crm, helpdesk, lovable-starter, messy)
// on the Postgres at MORPH_FIXTURES_URL (default: the docker compose service).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
export const FIXTURES = ['crm', 'helpdesk', 'lovable-starter', 'messy'];
export const adminUrl = process.env.MORPH_FIXTURES_URL ?? 'postgres://postgres:postgres@127.0.0.1:54329/postgres';
export const dbName = (f) => `morph_${f.replace(/-/g, '_')}`;

export function fixtureUrl(f) {
  const u = new URL(adminUrl);
  u.pathname = `/${dbName(f)}`;
  return u.toString();
}

async function exists(admin, name) {
  const r = await admin.query('select 1 from pg_database where datname = $1', [name]);
  return r.rowCount > 0;
}

export async function setupFixture(f, { reset = false } = {}) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const name = dbName(f);
    if (await exists(admin, name)) {
      if (!reset) return false;
      await admin.query(`drop database "${name}" with (force)`);
    }
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const db = new pg.Client({ connectionString: fixtureUrl(f) });
  await db.connect();
  try {
    for (const file of [join(root, 'supabase-shim.sql'), join(root, f, 'schema.sql'), join(root, f, 'seed.sql')]) {
      await db.query(readFileSync(file, 'utf8'));
    }
  } finally {
    await db.end();
  }
  return true;
}

async function main() {
  const cmd = process.argv[2] ?? 'up';
  const only = process.argv.slice(3);
  const list = only.length ? only : FIXTURES;
  for (const f of list) {
    const made = await setupFixture(f, { reset: cmd === 'reset' });
    console.log(`${made ? '✓' : '·'} ${f} ${made ? 'ready' : 'already exists (use fixtures:reset)'} → ${fixtureUrl(f).replace(/:[^:@/]+@/, ':***@')}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    console.error('Is Postgres running? Start it with `docker compose up -d db`, or set MORPH_FIXTURES_URL.');
    process.exit(1);
  });
}
