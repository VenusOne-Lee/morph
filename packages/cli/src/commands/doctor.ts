import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { viewName } from '@morph-reports/spec';
import { connectReadOnly } from '../scan/connect.js';
import { readMorphDir } from '../files.js';
import { t } from '../i18n.js';
import { resolveConnection } from './connection.js';
import type { Io } from './io.js';
import { VERSION } from '../version.js';

export interface DoctorCheck {
  check: string;
  ok: boolean;
  fix?: string;
}

/** Finds JWTs in .env files whose role claim is the service role (MO-908). */
export function findServiceRoleJwts(cwd: string): string[] {
  const hits: string[] = [];
  for (const f of readdirSync(cwd).filter((x) => /^\.env/.test(x))) {
    const text = readFileSync(join(cwd, f), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?(eyJ[\w-]+\.[\w-]+\.[\w-]+)/.exec(line);
      if (!m) continue;
      try {
        const payload = JSON.parse(Buffer.from(m[2]!.split('.')[1]!, 'base64url').toString('utf8')) as { role?: string };
        if (payload.role === 'service_role') hits.push(`${f}: ${m[1]}`);
      } catch {
        /* not a JWT */
      }
    }
  }
  return hits;
}

/** `morph doctor` (MO-116, MO-908). Each failed check prints its fix in one line. */
export async function runDoctor(opts: { cwd: string; url?: string; allowSuperuser?: boolean }, io: Io): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const add = (check: string, ok: boolean, fix?: string) => checks.push({ check, ok, ...(fix ? { fix } : {}) });
  io.out(t('doctor.title'));

  const files = readMorphDir(opts.cwd);
  add('morph/model.json found', !!files, 'Run `morph init`.');

  const sr = findServiceRoleJwts(opts.cwd);
  add('No service-role key in .env files', sr.length === 0, `Remove the service-role key from ${sr.join(', ')}. Morph only needs the anon key.`);

  const reactPkg = join(opts.cwd, 'node_modules', '@morph-reports', 'react', 'package.json');
  if (existsSync(reactPkg)) {
    const v = (JSON.parse(readFileSync(reactPkg, 'utf8')) as { version: string }).version;
    add(`@morph-reports/react ${v} matches the CLI (${VERSION})`, v.split('.').slice(0, 2).join('.') === VERSION.split('.').slice(0, 2).join('.'), 'Install matching versions of morph-reports and @morph-reports/react.');
  }

  if (files) {
    const exposedPii = Object.values(files.model.entities).flatMap((e) => Object.values(e.fields).filter((f) => f.pii && f.exposed).map((f) => `${e.name}.${f.name}`));
    add(exposedPii.length ? `PII exposed on purpose: ${exposedPii.join(', ')}` : 'No PII columns exposed', true);
  }

  let conn;
  try {
    const c = resolveConnection(opts.cwd, opts.url);
    conn = await connectReadOnly(c.url, { allowSuperuser: opts.allowSuperuser || c.source === 'supabase-local' });
  } catch (e) {
    add('Database reachable', false, (e as Error).message);
  }
  if (conn && !files) await conn.close();
  if (conn && files) {
    try {
      await conn.readOnly(async (db) => {
        const fns = await db.query<{ name: string; secdef: boolean }>(
          `select p.proname as name, p.prosecdef as secdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'morph\\_%'`,
        );
        const has = (n: string) => fns.rows.some((r) => r.name === n);
        add('Migration applied (morph functions exist)', has('morph_preview_action') && has('morph_apply_action') && has('morph_undo'), 'Run `supabase db push` to apply supabase/migrations/*_morph.sql.');
        const definer = fns.rows.filter((r) => r.secdef).map((r) => r.name);
        add('Morph functions are SECURITY INVOKER', definer.length === 0, `Re-apply the migration; these run as definer: ${definer.join(', ')}.`);

        const views = await db.query<{ name: string; opts: string[] | null }>(
          `select c.relname as name, c.reloptions as opts from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'v' and c.relname like 'morph\\_r\\_%'`,
        );
        for (const r of files.reports.filter((x) => !x.broken)) {
          const v = views.rows.find((x) => x.name === viewName(r.id));
          if (!v) add(`View for report ${r.id} exists`, false, 'Run `morph migrate` then `supabase db push`.');
          else add(`View ${v.name} is security_invoker`, (v.opts ?? []).includes('security_invoker=true'), 'Re-apply the Morph migration; the view must use security_invoker.');
        }

        const audit = await db.query<{ rls: boolean }>(`select relrowsecurity as rls from pg_class where oid = to_regclass('public.morph_audit')`);
        add('morph_audit has RLS on', audit.rows[0]?.rls === true, 'Re-apply the Morph migration.');

        const rls = await db.query<{ name: string; rls: boolean }>(`select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = any($1) and c.relkind = 'r'`, [files.model.source.schemas]);
        for (const e of Object.values(files.model.entities).filter((x) => x.exposed && x.kind === 'table')) {
          const row = rls.rows.find((r) => r.name === e.name);
          add(`RLS on for exposed table ${e.name}`, row?.rls === true, `Turn RLS on: alter table ${e.name} enable row level security; then add policies.`);
        }

        const pol = await db.query<{ table: string; cmd: string }>(`select tablename as table, cmd from pg_policies where schemaname = any($1)`, [files.model.source.schemas]);
        for (const a of files.actions.actions.filter((x) => x.enabled)) {
          const ok = pol.rows.some((p) => p.table === a.table && (p.cmd === 'UPDATE' || p.cmd === 'ALL'));
          add(`Action ${a.id} has an UPDATE policy`, ok, `Add an UPDATE policy on ${a.table}, or set enabled: false for ${a.id} in morph/actions.json.`);
        }
      });
    } finally {
      await conn.close();
    }
  }

  for (const c of checks) io.out(c.ok ? io.good(t('doctor.ok', { check: c.check })) : io.bad(t('doctor.fail', { check: c.check, fix: c.fix ?? '' })));
  const failed = checks.filter((c) => !c.ok).length;
  io.out(failed ? io.bad(t('doctor.summary', { failed, total: checks.length })) : io.good(t('doctor.allGood', { total: checks.length })));
  return checks;
}
