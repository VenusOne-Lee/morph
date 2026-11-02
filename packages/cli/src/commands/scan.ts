import type { MorphModel, ReportSpec } from '@morph-reports/spec';
import { validateReport, formatIssues } from '@morph-reports/spec';
import { generateMigration, migrationFileName } from '@morph-reports/sql';
import { scanDatabase } from '../scan/index.js';
import { discoverActions } from '../scan/model.js';
import { readMorphDir, writeMigration, writeMorphDir } from '../files.js';
import { t } from '../i18n.js';
import { resolveConnection } from './connection.js';
import type { Io } from './io.js';
import { VERSION } from '../version.js';

export interface ModelDiff {
  addedTables: string[];
  removedTables: string[];
  addedColumns: string[];
  removedColumns: string[];
  enumChanges: { id: string; added: string[]; removed: string[] }[];
  rlsChanges: { table: string; from: string; to: string }[];
}

export function diffModels(prev: MorphModel, next: MorphModel): ModelDiff {
  const d: ModelDiff = { addedTables: [], removedTables: [], addedColumns: [], removedColumns: [], enumChanges: [], rlsChanges: [] };
  for (const n of Object.keys(next.entities)) if (!prev.entities[n]) d.addedTables.push(n);
  for (const n of Object.keys(prev.entities)) if (!next.entities[n]) d.removedTables.push(n);
  for (const [n, e] of Object.entries(next.entities)) {
    const p = prev.entities[n];
    if (!p) continue;
    for (const f of Object.keys(e.fields)) if (!p.fields[f]) d.addedColumns.push(`${n}.${f}`);
    for (const f of Object.keys(p.fields)) if (!e.fields[f]) d.removedColumns.push(`${n}.${f}`);
    if (p.rls !== e.rls) d.rlsChanges.push({ table: n, from: p.rls, to: e.rls });
  }
  for (const [id, en] of Object.entries(next.enums)) {
    const p = prev.enums[id];
    if (!p) continue;
    const added = en.values.filter((v) => !p.values.includes(v));
    const removed = p.values.filter((v) => !en.values.includes(v));
    if (added.length || removed.length) d.enumChanges.push({ id, added, removed });
  }
  return d;
}

export function isEmptyDiff(d: ModelDiff): boolean {
  return Object.values(d).every((v) => (v as unknown[]).length === 0);
}

/** Keeps the builder's exposure choices on fields that still exist. */
export function carryChoices(prev: MorphModel, next: MorphModel): MorphModel {
  const out = structuredClone(next);
  for (const [n, e] of Object.entries(out.entities)) {
    const p = prev.entities[n];
    if (!p) continue;
    for (const [f, field] of Object.entries(e.fields)) {
      const pf = p.fields[f];
      if (pf && e.rls !== 'rls_off') field.exposed = pf.exposed;
      if (pf?.label) field.label = pf.label;
    }
    if (p.label) e.label = p.label;
  }
  return out;
}

/** Marks reports that the new model no longer supports. Nothing is deleted. */
export function markBroken(reports: ReportSpec[], model: MorphModel, actions = discoverActions(model)): ReportSpec[] {
  return reports.map((r) => {
    const { broken: _old, ...rest } = r;
    const v = validateReport(rest, model, actions);
    return v.ok ? rest : { ...rest, broken: { reason: formatIssues(v.issues).split('\n')[0]! } };
  });
}

/** `morph scan` / `morph diff` (MO-115). */
export async function runScan(opts: { cwd: string; url?: string; yes?: boolean; diffOnly?: boolean; allowSuperuser?: boolean }, io: Io): Promise<{ diff: ModelDiff; wrote: boolean }> {
  const current = readMorphDir(opts.cwd);
  if (!current) {
    io.err(io.bad('No morph/model.json here. Run `morph init` first.'));
    return { diff: diffModels({ specVersion: 0, source: { kind: 'supabase', schemas: [] }, entities: {}, enums: {}, joins: [] }, { specVersion: 0, source: { kind: 'supabase', schemas: [] }, entities: {}, enums: {}, joins: [] }), wrote: false };
  }
  const conn = resolveConnection(opts.cwd, opts.url);
  const scan = await scanDatabase({ url: conn.url, allowSuperuser: opts.allowSuperuser || conn.source === 'supabase-local', schemas: current.model.source.schemas });
  const diff = diffModels(current.model, scan.model);
  if (isEmptyDiff(diff)) {
    io.out(io.good(t('scan.noChanges')));
    return { diff, wrote: false };
  }
  io.out(t('scan.diffTitle'));
  for (const x of diff.addedTables) io.out(io.good(`  + table ${x}`));
  for (const x of diff.removedTables) io.out(io.bad(`  - table ${x}`));
  for (const x of diff.addedColumns) io.out(io.good(`  + ${x}`));
  for (const x of diff.removedColumns) io.out(io.bad(`  - ${x}`));
  for (const x of diff.enumChanges) io.out(io.warn(`  ~ enum ${x.id}: ${x.added.map((v) => `+${v}`).concat(x.removed.map((v) => `-${v}`)).join(' ')}`));
  for (const x of diff.rlsChanges) io.out(io.warn(`  ~ ${x.table}: ${x.from} → ${x.to}`));

  const model = carryChoices(current.model, scan.model);
  const actions = discoverActions(model);
  // Keep the builder's enabled flags and limits on actions that still exist.
  for (const a of actions.actions) {
    const prev = current.actions.actions.find((p) => p.id === a.id);
    if (prev) {
      a.enabled = prev.enabled && a.enabled;
      a.bulkMax = prev.bulkMax;
    }
  }
  actions.undoDays = current.actions.undoDays;
  const reports = markBroken(current.reports, model, actions);
  for (const r of reports) if (r.broken) io.out(io.bad(t('scan.broken', { id: r.id, reason: r.broken.reason })));
  if (opts.diffOnly) return { diff, wrote: false };
  const answer = opts.yes ? 'y' : io.interactive ? await io.ask(t('scan.confirm')) : 'n';
  if (!/^y/i.test(answer)) return { diff, wrote: false };
  writeMorphDir(opts.cwd, { model, actions, reports });
  const path = writeMigration(opts.cwd, migrationFileName(), generateMigration({ model, reports, actions }, { version: VERSION }));
  io.out(io.good(`✓ Wrote morph/ and ${path}`));
  return { diff, wrote: true };
}
