#!/usr/bin/env node
// Dev-only demo: runs the example against a fresh copy of the local crm fixture.
// Each browser query is replayed on the fixture database as the chosen user, inside
// a transaction with `role authenticated` and their JWT claims, the way PostgREST does.
// Needs the fixture Postgres (docker compose up -d) and `pnpm build`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer as createViteServer } from 'vite';
import http from 'node:http';
import { createFixtureDb, FIXTURES_DIR } from '@morph-reports/testkit';

const port = Number(process.env.PORT ?? 5174);
const db = await createFixtureDb('crm');
const dir = join(FIXTURES_DIR, 'crm', 'supabase', 'migrations');
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));

process.env.VITE_MORPH_DEMO = '1';
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });

const body = (req) => new Promise((res) => {
  let s = '';
  req.on('data', (c) => (s += c));
  req.on('end', () => res(s ? JSON.parse(s) : {}));
});

const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/__morph_demo')) {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.endsWith('/session')) {
        const out = await db.as(url.searchParams.get('user')).auth.getSession();
        res.end(JSON.stringify(out));
        return;
      }
      const { user, calls } = await body(req);
      let q = db.as(user);
      for (const c of calls) if (c.m !== 'abortSignal') q = q[c.m](...c.a);
      const out = await q;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(out));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ data: null, error: { message: String(e?.message ?? e) } }));
    }
    return;
  }
  vite.middlewares(req, res);
});

server.listen(port, () => console.log(`Morph demo on http://localhost:${port} (crm fixture, database ${db.database})`));
const stop = async () => {
  server.close();
  await vite.close();
  await db.drop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
