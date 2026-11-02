import { generateMigration, migrationFileName } from '@morph-reports/sql';
import { loadProject } from '@morph-reports/spec';
import { readMorphDir, writeMigration } from '../files.js';
import type { Io } from './io.js';
import { VERSION } from '../version.js';

/** `morph migrate`: regenerate the migration from the committed specs. */
export function runMigrate(opts: { cwd: string; stdout?: boolean }, io: Io): string | null {
  const files = readMorphDir(opts.cwd);
  if (!files) {
    io.err(io.bad('No morph/model.json here. Run `morph init` first.'));
    return null;
  }
  const project = loadProject({ model: files.model, reports: files.reports, actions: files.actions });
  const sql = generateMigration(project, { version: VERSION });
  if (opts.stdout) {
    io.out(sql);
    return sql;
  }
  const path = writeMigration(opts.cwd, migrationFileName(), sql);
  io.out(io.good(`✓ Wrote ${path}. Apply it with: supabase db push`));
  return path;
}
