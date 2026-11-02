import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActionsFile, MorphModel, ReportSpec } from '@morph-reports/spec';

export const SCHEMA_BASE = 'https://raw.githubusercontent.com/VenusOne-Lee/morph/main/packages/spec/schema';

/** Stable key order and 2-space JSON so diffs are reviewable (MO-110). */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

const FIRST = ['$schema', 'specVersion', 'id', 'name', 'title', 'why', 'generatedBy', 'source', 'kind', 'joins', 'fields', 'derived', 'filters', 'groupBy', 'groupByOptions', 'measures', 'sort', 'limit', 'widgets', 'actions'];

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as object).sort((a, b) => {
      const ia = FIRST.indexOf(a);
      const ib = FIRST.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return 0; // keep insertion order otherwise (fields, enum values stay meaningful)
    });
    return Object.fromEntries(keys.map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  }
  return v;
}

export interface MorphFiles {
  model: MorphModel;
  actions: ActionsFile;
  reports: ReportSpec[];
}

export function readMorphDir(cwd: string): MorphFiles | null {
  const dir = join(cwd, 'morph');
  if (!existsSync(join(dir, 'model.json'))) return null;
  const model = JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8')) as MorphModel;
  const actions = existsSync(join(dir, 'actions.json')) ? (JSON.parse(readFileSync(join(dir, 'actions.json'), 'utf8')) as ActionsFile) : { specVersion: 0 as const, undoDays: 30, actions: [] };
  const rdir = join(dir, 'reports');
  const reports = existsSync(rdir)
    ? readdirSync(rdir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(rdir, f), 'utf8')) as ReportSpec)
    : [];
  return { model, actions, reports };
}

export function writeMorphDir(cwd: string, files: MorphFiles): string[] {
  const dir = join(cwd, 'morph');
  const rdir = join(dir, 'reports');
  mkdirSync(rdir, { recursive: true });
  const written: string[] = [];
  const w = (p: string, v: unknown) => {
    writeFileSync(join(cwd, p), stableJson(v));
    written.push(p);
  };
  w('morph/model.json', { $schema: `${SCHEMA_BASE}/model.v0.json`, ...files.model });
  w('morph/actions.json', { $schema: `${SCHEMA_BASE}/actions.v0.json`, ...files.actions });
  for (const r of files.reports) w(`morph/reports/${r.id}.json`, { $schema: `${SCHEMA_BASE}/report.v0.json`, ...r });
  return written;
}

export function writeMigration(cwd: string, name: string, sql: string): string {
  const dir = join(cwd, 'supabase', 'migrations');
  mkdirSync(dir, { recursive: true });
  // Always a new timestamped file: Supabase tracks applied migrations by name,
  // and the Morph migration is idempotent, so re-running it is safe.
  const file = name;
  writeFileSync(join(dir, file), sql);
  return `supabase/migrations/${file}`;
}
