import type { ActionsFile, MorphModel } from '@morph-reports/spec';
import { connectReadOnly, type RoleCheck } from './connect.js';
import { defaultSchemas, introspect, SUPABASE_INTERNAL, type Introspection } from './introspect.js';
import { sampleTable, type ColumnStats } from './sample.js';
import { piiByName } from './pii.js';
import { buildModel, discoverActions, type ScanNotes } from './model.js';

export interface ScanResult {
  intro: Introspection;
  model: MorphModel;
  actions: ActionsFile;
  notes: ScanNotes;
  role: RoleCheck;
  timings: Record<string, number>;
  counts: { tables: number; columns: number; foreignKeys: number };
}

export interface ScanOptions {
  url: string;
  schemas?: string[];
  allowSuperuser?: boolean;
  /** Total budget for sampling, ms. Default 60s. */
  budgetMs?: number;
}

/** Read-only scan: introspect, sample aggregates, classify, build the model. */
export async function scanDatabase(opts: ScanOptions): Promise<ScanResult> {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const schemas = defaultSchemas(opts.schemas).filter((s) => opts.schemas?.includes(s) || !SUPABASE_INTERNAL.test(s));
  const conn = await connectReadOnly(opts.url, { allowSuperuser: opts.allowSuperuser ?? false });
  try {
    timings.connect = Date.now() - t0;
    const intro = await conn.readOnly((c) => introspect(c, schemas));
    timings.introspect = Date.now() - t0 - timings.connect;
    const deadline = Date.now() + (opts.budgetMs ?? 60_000);
    const stats: Record<string, Record<string, ColumnStats>> = {};
    const t1 = Date.now();
    for (const t of intro.tables) {
      if (!t.rlsEnabled && t.kind === 'table') continue; // blocked anyway; don't read it
      stats[t.name] = await conn.readOnly((c) => sampleTable(c, t, { skip: (_t, col) => piiByName(col.name).pii, deadline }));
    }
    timings.sample = Date.now() - t1;
    const { model, notes } = buildModel(intro, stats);
    const actions = discoverActions(model);
    timings.total = Date.now() - t0;
    return {
      intro,
      model,
      actions,
      notes,
      role: conn.role,
      timings,
      counts: {
        tables: intro.tables.length,
        columns: intro.tables.reduce((n, t) => n + t.columns.length, 0),
        foreignKeys: intro.tables.reduce((n, t) => n + t.foreignKeys.length, 0),
      },
    };
  } finally {
    await conn.close();
  }
}
