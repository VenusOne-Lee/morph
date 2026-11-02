import type { ActionsFile, DerivedField, ModelField, MorphModel, ReportSpec, SemanticType } from './types.js';
import { MorphError } from './errors.js';
import { humanize, parseFieldExpr, parseJoin, splitRef } from './refs.js';
import { formatIssues, validateReport } from './validate.js';

export interface ResolvedColumn {
  /** Column name in the generated view and in fetched rows. */
  alias: string;
  /** `deals.stage`, or the derived key. */
  ref: string;
  entity: string | null;
  field: string;
  label: string;
  semantic: SemanticType;
  pgType: string;
  currency?: string;
  enumId?: string;
  derived?: DerivedField;
  /** System or action columns the renderer needs but doesn't show. */
  hidden: boolean;
}

export interface ResolvedJoin {
  from: { entity: string; field: string };
  to: { entity: string; field: string };
}

export interface ResolvedReport {
  spec: ReportSpec;
  view: string;
  schema: string;
  sourceKey: string | null;
  displayAlias: string | null;
  joins: ResolvedJoin[];
  columns: ResolvedColumn[];
  /** Lookup by alias or by ref. */
  column(refOrAlias: string): ResolvedColumn | undefined;
}

export const ID_COLUMN = '_morph_id';
export const VERSION_COLUMN = '_morph_version';

export function viewName(reportId: string): string {
  return `morph_r_${reportId.replace(/-/g, '_')}`;
}

export function resolveReport(spec: ReportSpec, model: MorphModel, actions?: ActionsFile): ResolvedReport {
  const v = validateReport(spec, model, actions);
  if (!v.ok) {
    throw new MorphError('spec_invalid', `Report "${spec.id ?? '?'}" is not valid.\n${formatIssues(v.issues)}`, {
      hint: 'Fix the report spec or re-run `morph scan` if the schema changed.',
      docsPath: 'spec.md',
      details: v.issues,
    });
  }
  const source = model.entities[spec.source]!;
  const derivedKeys = Object.keys(spec.derived ?? {});
  const columns: ResolvedColumn[] = [];
  const fieldOf = (entity: string, field: string): ModelField => model.entities[entity]!.fields[field]!;

  const pushModelColumn = (entity: string, field: string, alias: string, hidden: boolean) => {
    const f = fieldOf(entity, field);
    columns.push({
      alias,
      ref: `${entity}.${field}`,
      entity,
      field,
      label: columnLabel(model, spec.source, entity, field, alias),
      semantic: f.semantic,
      pgType: f.pgType,
      ...(f.currency ? { currency: f.currency } : {}),
      ...(f.enum ? { enumId: f.enum } : {}),
      hidden,
    });
  };

  if (source.primaryKey) {
    columns.push({ alias: ID_COLUMN, ref: `${spec.source}.${source.primaryKey}`, entity: spec.source, field: source.primaryKey, label: 'ID', semantic: 'id', pgType: 'text', hidden: true });
    columns.push({ alias: VERSION_COLUMN, ref: `${spec.source}.xmin`, entity: spec.source, field: 'xmin', label: 'Version', semantic: 'text', pgType: 'text', hidden: true });
  }

  for (const expr of spec.fields) {
    const p = parseFieldExpr(expr, spec.source, derivedKeys);
    if (p.derived) {
      const d = spec.derived![p.field]!;
      const base = 'days_since' in d ? d.days_since : 'bucket' in d ? d.bucket.field : d.date_trunc.field;
      const bf = splitRef(base)![1];
      const approximate = 'days_since' in d && (d.approximate || /updated_at$/.test(bf));
      columns.push({
        alias: p.alias,
        ref: p.field,
        entity: null,
        field: p.field,
        label: humanize(p.alias) + (approximate ? ' (approximate)' : ''),
        semantic: 'days_since' in d ? 'count' : 'bucket' in d ? 'text' : 'date',
        pgType: 'days_since' in d ? 'integer' : 'bucket' in d ? 'text' : 'date',
        derived: d,
        hidden: false,
      });
    } else {
      pushModelColumn(p.entity!, p.field, p.alias, false);
    }
  }

  // Action columns must be present as raw values (owner_id, stage).
  for (const id of spec.actions ?? []) {
    const [t, c] = id.split('.') as [string, string];
    if (t !== spec.source) continue;
    if (!columns.some((col) => col.entity === t && col.field === c)) {
      const alias = columns.some((col) => col.alias === c) ? `_morph_${c}` : c;
      pushModelColumn(t, c, alias, true);
    }
  }
  // Filters, groupBy and sort on refs not in fields still need a column for runtime use.
  const extraRefs = [...(spec.groupBy ?? []), ...(spec.groupByOptions ?? []), ...(spec.sort ?? []).map((s) => s.field), ...(spec.measures ?? []).flatMap((m) => (m.field ? [m.field] : []))];
  for (const ref of extraRefs) {
    if (!ref.includes('.')) continue;
    if (columns.some((c) => c.ref === ref)) continue;
    const [e, f] = splitRef(ref)!;
    const alias = e === spec.source ? f : `${e}_${f}`;
    pushModelColumn(e, f, columns.some((c) => c.alias === alias) ? `_morph_${e}_${f}` : alias, true);
  }

  const displayAlias = source.displayField ? (columns.find((c) => c.entity === spec.source && c.field === source.displayField)?.alias ?? null) : null;
  if (source.displayField && !displayAlias) pushModelColumn(spec.source, source.displayField, columns.some((c) => c.alias === source.displayField) ? '_morph_display' : source.displayField, true);

  const byKey = new Map<string, ResolvedColumn>();
  for (const c of columns) {
    byKey.set(c.alias, c);
    if (!byKey.has(c.ref)) byKey.set(c.ref, c);
  }

  return {
    spec,
    view: viewName(spec.id),
    schema: source.schema,
    sourceKey: source.primaryKey,
    displayAlias: displayAlias ?? (source.displayField ? (columns.find((c) => c.entity === spec.source && c.field === source.displayField)?.alias ?? null) : null),
    joins: (spec.joins ?? []).map(parseJoin),
    columns,
    column: (k) => byKey.get(k),
  };
}

export function singular(label: string): string {
  if (/ies$/i.test(label)) return label.slice(0, -3) + 'y';
  if (/(ss|us)$/i.test(label)) return label;
  return label.replace(/s$/i, '');
}

function columnLabel(model: MorphModel, source: string, entity: string, field: string, alias: string): string {
  const ent = model.entities[entity]!;
  const f = ent.fields[field]!;
  const defaultAlias = entity === source ? field : `${entity}_${field}`;
  if (alias !== defaultAlias) return humanize(alias);
  if (entity === source) return f.label;
  if (field === ent.displayField) return singular(ent.label);
  return `${singular(ent.label)} ${f.label.toLowerCase()}`;
}
