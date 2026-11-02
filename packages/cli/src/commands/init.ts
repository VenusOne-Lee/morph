import type { ActionsFile, MorphModel, ReportSpec } from '@morph-reports/spec';
import { generateMigration, migrationFileName } from '@morph-reports/sql';
import { scanDatabase, type ScanResult } from '../scan/index.js';
import { discoverActions } from '../scan/model.js';
import { generateReports, type Candidate } from '../generators/index.js';
import { checklist, type ListItem } from '../tui/list.js';
import { writeMigration, writeMorphDir } from '../files.js';
import { t } from '../i18n.js';
import { resolveConnection } from './connection.js';
import { reportPreviewLine } from './preview.js';
import type { Io } from './io.js';
import { VERSION } from '../version.js';

export interface InitOptions {
  cwd: string;
  url?: string;
  yes?: boolean;
  dryRun?: boolean;
  allowSuperuser?: boolean;
  schemas?: string[];
  verbose?: boolean;
  stuckDays?: number;
  ownerCap?: number;
}

export interface InitResult {
  scan: ScanResult;
  model: MorphModel;
  actions: ActionsFile;
  reports: ReportSpec[];
  written: string[];
  migration: string;
}

/** `morph init` (MO-101 – MO-114). */
export async function runInit(opts: InitOptions, io: Io): Promise<InitResult> {
  io.out(t('init.intro'));
  io.out(io.dim(t('init.steps')));
  io.out('');
  const conn = resolveConnection(opts.cwd, opts.url);
  io.out(t(conn.source === 'supabase-local' ? 'init.connectingLocal' : 'init.connecting'));
  const scan = await scanDatabase({
    url: conn.url,
    allowSuperuser: opts.allowSuperuser || conn.source === 'supabase-local',
    ...(opts.schemas ? { schemas: opts.schemas } : {}),
  });
  io.out(io.good(t('init.scanned', { tables: scan.counts.tables, columns: scan.counts.columns, fks: scan.counts.foreignKeys })));
  for (const tbl of scan.notes.rlsOff) io.out(io.bad(t('init.rlsOff', { table: tbl })));
  for (const tbl of scan.notes.rlsNoPolicies) io.out(io.warn(t('init.rlsNoPolicies', { table: tbl })));
  if (scan.notes.pii.length) io.out(io.warn(t('init.pii', { columns: scan.notes.pii.join(', ') })));
  if (opts.verbose) io.out(io.dim(`timings: ${JSON.stringify(scan.timings)} · role ${scan.role.role}`));

  // Field picker (MO-109): defaults are non-PII on, PII off, RLS-off locked.
  const model = structuredClone(scan.model);
  if (!opts.yes && io.interactive) {
    const items: ListItem[] = [];
    for (const e of Object.values(model.entities)) {
      for (const f of Object.values(e.fields)) {
        const badges = [f.semantic === 'status_enum' ? 'enum' : '', f.semantic === 'owner_ref' ? 'owner' : '', f.pii ? 'PII' : '', e.rls === 'rls_off' ? 'RLS off' : ''].filter(Boolean);
        items.push({
          id: `${e.name}.${f.name}`,
          group: e.name,
          label: f.name,
          detail: f.semantic,
          badges,
          checked: f.exposed && e.rls !== 'rls_off',
          ...(e.rls === 'rls_off' ? { locked: t('picker.locked') } : {}),
        });
      }
    }
    const picked = await checklist(items, { title: t('picker.title'), help: t('picker.help') });
    for (const it of picked) {
      const [e, f] = it.id.split('.') as [string, string];
      const field = model.entities[e]?.fields[f];
      if (field && !it.locked) field.exposed = it.checked;
    }
  }

  const actions = discoverActions(model);
  for (const a of actions.actions) {
    if (a.kind === 'set_enum') {
      if (a.enabled) io.out(io.good(t('init.actionEnum', { id: a.id, values: (a.values ?? []).join(', ') })));
    } else if (a.enabled) io.out(io.good(t('init.actionFk', { id: a.id, target: a.target?.entity ?? '?' })));
    if (!a.enabled) {
      const reason = (a.policies ?? []).length === 0 ? `no UPDATE policy on ${a.table}` : 'values were only sampled; confirm them in morph/actions.json';
      io.out(io.dim(t('init.actionDisabled', { id: a.id, reason })));
    }
  }

  let candidates: Candidate[] = generateReports(model, actions, {
    ...(opts.stuckDays ? { stuckDays: opts.stuckDays } : {}),
    ...(opts.ownerCap ? { ownerCap: opts.ownerCap } : {}),
  });
  if (!opts.yes && io.interactive && candidates.length) {
    const items: ListItem[] = candidates.map((c) => ({ id: c.spec.id, group: c.spec.source, label: c.spec.title, detail: reportPreviewLine(c.spec), checked: true }));
    const picked = await checklist(items, { title: t('reports.title', { count: candidates.length }), help: t('reports.help') });
    const keep = new Set(picked.filter((i) => i.checked).map((i) => i.id));
    io.out(io.dim(t('reports.kept', { kept: keep.size, count: candidates.length })));
    candidates = candidates.filter((c) => keep.has(c.spec.id));
  } else {
    for (const c of candidates) io.out(`  ${c.spec.title.padEnd(28)} ${io.dim(reportPreviewLine(c.spec))}`);
  }
  const reports = candidates.map((c) => c.spec);
  const enabledActions = actions.actions.filter((a) => a.enabled).length;
  io.out(io.accent(t('init.ready', { reports: reports.length, actions: enabledActions })));

  const migration = generateMigration({ model, reports, actions }, { version: VERSION });
  const written: string[] = [];
  if (!opts.dryRun) {
    written.push(...writeMorphDir(opts.cwd, { model, actions, reports }));
    written.push(writeMigration(opts.cwd, migrationFileName(), migration));
    io.out('');
    io.out(t('init.written'));
    for (const w of written) io.out(`  ${w}`);
  } else {
    io.out(io.dim(t('init.dryRun')));
  }

  io.out('');
  io.out(t('init.next'));
  io.out(`  ${t('init.next1')}`);
  io.out(`  ${t('init.next2')}`);
  io.out(`  ${t('init.next3')}`);
  io.out(io.dim(t('init.docs')));
  return { scan, model, actions, reports, written, migration };
}
