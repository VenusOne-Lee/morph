import type { ActionsFile, ActionSpec, ModelEntity, ModelEnum, ModelField, ModelJoin, MorphModel, PolicyRef, RlsStatus } from '@morph-reports/spec';
import { DEFAULT_BULK_MAX, DEFAULT_UNDO_DAYS, humanize, SPEC_VERSION } from '@morph-reports/spec';
import type { Introspection, IntroTable } from './introspect.js';
import type { ColumnStats } from './sample.js';
import { classifyColumn, findUserTables, TERMINAL } from './classify.js';

export interface ScanNotes {
  rlsOff: string[];
  rlsNoPolicies: string[];
  pii: string[];
  noPrimaryKey: string[];
  mixedCaseEnums: string[];
  inferredJoins: string[];
}

export interface BuildResult {
  model: MorphModel;
  notes: ScanNotes;
}

export function rlsStatus(t: IntroTable): RlsStatus {
  if (t.kind === 'view') return t.policies.length ? 'rls_ok' : 'rls_ok';
  if (!t.rlsEnabled) return 'rls_off';
  return t.policies.length ? 'rls_ok' : 'rls_on_no_policies';
}

const DISPLAY_NAMES = ['name', 'title', 'label', 'display_name', 'full_name', 'company_name', 'subject', 'ref', 'code', 'slug', 'description'];

export function pickDisplayField(fields: Record<string, ModelField>): string | null {
  for (const n of DISPLAY_NAMES) if (fields[n] && !fields[n].pii) return n;
  const firstText = Object.values(fields).find((f) => f.semantic === 'text' && !f.pii && !/(_id|uuid)$/.test(f.name) && !/uuid/.test(f.pgType));
  return firstText?.name ?? null;
}

export function enumLabel(v: string): string {
  const s = v.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Builds the semantic model (MO-110) from catalog facts and value stats.
 * Defaults: non-PII fields on, PII off, tables with RLS off blocked.
 */
export function buildModel(intro: Introspection, stats: Record<string, Record<string, ColumnStats>>, opts: { kind?: 'supabase' | 'postgres' } = {}): BuildResult {
  const notes: ScanNotes = { rlsOff: [], rlsNoPolicies: [], pii: [], noPrimaryKey: [], mixedCaseEnums: [], inferredJoins: [] };
  const userTables = findUserTables(intro.tables);
  const byName = new Map(intro.tables.map((t) => [t.name, t]));
  const enums: Record<string, ModelEnum> = {};
  const joins: ModelJoin[] = [];
  const entities: Record<string, ModelEntity> = {};

  for (const t of intro.tables) {
    const rls = rlsStatus(t);
    if (rls === 'rls_off') notes.rlsOff.push(t.name);
    if (rls === 'rls_on_no_policies') notes.rlsNoPolicies.push(t.name);
    const pk = t.primaryKey.length === 1 ? t.primaryKey[0]! : null;
    if (!pk && t.kind === 'table') notes.noPrimaryKey.push(t.name);
    const fields: Record<string, ModelField> = {};

    for (const col of t.columns) {
      const fk = t.foreignKeys.find((f) => f.columns.length === 1 && f.columns[0] === col.name);
      let fkTarget: { table: string; schema: string; inferred: boolean; column: string } | undefined;
      if (fk) fkTarget = { table: fk.refTable, schema: fk.refSchema, inferred: false, column: fk.refColumns[0] ?? 'id' };
      else {
        // MO-108: `<table>_id` with a matching primary key type is a likely FK.
        const m = /^(.+)_id$/.exec(col.name);
        if (m && col.name !== pk) {
          const candidates = [m[1]!, `${m[1]}s`, `${m[1]}es`, m[1]!.replace(/y$/, 'ies')];
          const target = candidates.map((c) => byName.get(c)).find((x) => x && x.primaryKey.length === 1);
          const tpk = target?.columns.find((c) => c.name === target.primaryKey[0]);
          if (target && tpk && sameKeyType(tpk.pgType, col.pgType)) {
            fkTarget = { table: target.name, schema: target.schema, inferred: true, column: tpk.name };
          }
        }
      }
      const enumDef = col.enumType ? intro.enums.find((e) => `${e.schema}.${e.name}` === col.enumType) : undefined;
      const c = classifyColumn({
        table: t,
        column: col,
        ...(stats[t.name]?.[col.name] ? { stats: stats[t.name]![col.name]! } : {}),
        ...(enumDef ? { enumValues: enumDef.values } : {}),
        ...(fkTarget ? { fkTarget } : {}),
        userTables,
      });
      const field: ModelField = {
        name: col.name,
        label: humanize(col.name),
        pgType: col.enumType ?? col.pgType,
        semantic: c.semantic,
        nullable: col.nullable,
        pii: c.pii,
        exposed: !c.pii && c.semantic !== 'json',
        confidence: round(c.confidence),
        reason: c.pii && c.piiReason ? `${c.reason}; PII: ${c.piiReason}` : c.reason,
      };
      if (c.currency) field.currency = c.currency;
      if (fkTarget) {
        const ext = fkTarget.schema !== t.schema || !byName.has(fkTarget.table);
        field.references = { entity: ext ? `${fkTarget.schema}.${fkTarget.table}` : fkTarget.table, field: fkTarget.column, inferred: fkTarget.inferred };
        if (!ext) {
          joins.push({ from: `${t.name}.${col.name}`, to: `${fkTarget.table}.${fkTarget.column}`, inferred: fkTarget.inferred });
          if (fkTarget.inferred) notes.inferredJoins.push(`${t.name}.${col.name} -> ${fkTarget.table}.${fkTarget.column}`);
        }
      }
      if (c.semantic === 'status_enum' && c.enumValues) {
        const id = c.enumSource === 'pg_enum' && col.enumType ? col.enumType.split('.').pop()! : `${t.name}_${col.name}`;
        const values = c.enumValues;
        const lower = new Set(values.map((v) => v.toLowerCase()));
        if (lower.size !== values.length) notes.mixedCaseEnums.push(`${t.name}.${col.name}`);
        enums[id] = {
          id,
          values,
          labels: Object.fromEntries(values.map((v) => [v, enumLabel(v)])),
          terminal: values.filter((v) => TERMINAL.test(v)),
          source: c.enumSource!,
        };
        field.enum = id;
      }
      if (field.pii) notes.pii.push(`${t.name}.${col.name}`);
      fields[col.name] = field;
    }

    entities[t.name] = {
      name: t.name,
      schema: t.schema,
      label: humanize(t.name),
      kind: t.kind,
      primaryKey: pk,
      displayField: pickDisplayField(fields),
      rls,
      policies: t.policies.map((p): PolicyRef => ({ name: p.name, command: p.command, roles: p.roles })),
      exposed: rls !== 'rls_off',
      fields,
    };
  }

  return {
    model: { specVersion: SPEC_VERSION, source: { kind: opts.kind ?? (intro.hasAuthUsers ? 'supabase' : 'postgres'), schemas: intro.schemas }, entities, enums, joins },
    notes,
  };
}

function sameKeyType(a: string, b: string): boolean {
  const norm = (s: string) => (/^(integer|bigint|smallint)$/.test(s) ? 'int' : s);
  return norm(a) === norm(b);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const COMPANIONS = (col: string) => [`${col}_changed_at`, `${col}_updated_at`, 'stage_changed_at', 'status_changed_at', 'status_updated_at', 'updated_at'];

/**
 * Action discovery (MO-111): set_enum for each exposed status enum, set_fk
 * for each exposed owner ref. Enabled only where an UPDATE policy exists.
 */
export function discoverActions(model: MorphModel): ActionsFile {
  const actions: ActionSpec[] = [];
  for (const e of Object.values(model.entities)) {
    if (!e.exposed || e.rls === 'rls_off' || !e.primaryKey || e.kind === 'view') continue;
    const updatePolicies = e.policies.filter((p) => p.command === 'UPDATE' || p.command === 'ALL').map((p) => p.name);
    for (const f of Object.values(e.fields)) {
      if (!f.exposed || f.pii) continue;
      if (f.semantic === 'status_enum' && f.enum) {
        const en = model.enums[f.enum]!;
        const companion = COMPANIONS(f.name).find((c) => e.fields[c] && ['datetime', 'date'].includes(e.fields[c]!.semantic));
        actions.push({
          id: `${e.name}.${f.name}`,
          kind: 'set_enum',
          table: e.name,
          column: f.name,
          label: `Move ${f.label.toLowerCase()}`,
          values: en.values,
          terminal: en.terminal,
          ...(companion ? { sideEffects: [{ set: companion, to: 'now()' as const }] } : {}),
          bulkMax: DEFAULT_BULK_MAX,
          enabled: updatePolicies.length > 0 && en.source !== 'sampled',
          policies: updatePolicies,
        });
      }
      if (f.semantic === 'owner_ref' && f.references && !f.references.entity.includes('.')) {
        const target = model.entities[f.references.entity];
        if (!target || !target.exposed) continue;
        const companion = e.fields.updated_at && e.fields.updated_at.semantic === 'datetime' ? 'updated_at' : null;
        actions.push({
          id: `${e.name}.${f.name}`,
          kind: 'set_fk',
          table: e.name,
          column: f.name,
          label: 'Reassign',
          target: { entity: target.name, field: f.references.field, display: target.displayField },
          ...(companion ? { sideEffects: [{ set: companion, to: 'now()' as const }] } : {}),
          bulkMax: DEFAULT_BULK_MAX,
          enabled: updatePolicies.length > 0,
          policies: updatePolicies,
        });
      }
    }
  }
  return { specVersion: SPEC_VERSION, undoDays: DEFAULT_UNDO_DAYS, actions };
}
