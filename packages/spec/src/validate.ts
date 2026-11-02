import type {
  ActionsFile,
  ActionSpec,
  FilterOp,
  MeasureFn,
  MorphModel,
  ReportSpec,
  WidgetType,
  WidgetView,
} from './types.js';
import { HARD_BULK_MAX, SPEC_VERSION } from './types.js';
import { isIdent, parseFieldExpr, parseJoin, splitRef } from './refs.js';

export interface ValidationIssue {
  /** JSON path, e.g. `filters[1].op` */
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; issues: [] } | { ok: false; issues: ValidationIssue[] };

const FILTER_OPS: FilterOp[] = ['=', '!=', 'in', 'not_in', '>', '>=', '<', '<=', 'between', 'is_null', 'not_null', 'contains', 'last_n_days', 'this_month', 'this_quarter'];
const MEASURE_FNS: MeasureFn[] = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'];
const WIDGET_TYPES: WidgetType[] = ['bar', 'column', 'funnel', 'workload', 'heatmap', 'kpi', 'table', 'kanban', 'balancer', 'queue', 'kpi-fix'];
const WIDGET_VIEWS: WidgetView[] = ['report', 'act', 'combined'];
const NUMERIC_SEMANTICS = new Set(['money', 'count', 'percent', 'number']);
const REPORT_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

class Issues {
  list: ValidationIssue[] = [];
  add(path: string, message: string) {
    this.list.push({ path, message });
  }
  result(): ValidationResult {
    return this.list.length ? { ok: false, issues: this.list } : { ok: true, issues: [] };
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Readable one-line-per-issue text for CLI output and error states. */
export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('\n');
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export function validateModel(input: unknown): ValidationResult {
  const is = new Issues();
  if (!isObj(input)) {
    is.add('', 'model.json must be an object.');
    return is.result();
  }
  if (input.specVersion !== SPEC_VERSION) is.add('specVersion', `must be ${SPEC_VERSION}.`);
  if (!isObj(input.entities)) is.add('entities', 'must be an object keyed by table name.');
  if (!isObj(input.enums)) is.add('enums', 'must be an object keyed by enum id.');
  if (!Array.isArray(input.joins)) is.add('joins', 'must be a list.');
  if (is.list.length) return is.result();
  const model = input as unknown as MorphModel;

  for (const [name, e] of Object.entries(model.entities)) {
    const p = `entities.${name}`;
    if (!isObj(e)) {
      is.add(p, 'must be an object.');
      continue;
    }
    if (e.name !== name) is.add(`${p}.name`, `must equal the key "${name}".`);
    if (!['rls_ok', 'rls_on_no_policies', 'rls_off'].includes(e.rls)) is.add(`${p}.rls`, 'must be rls_ok, rls_on_no_policies or rls_off.');
    if (e.rls === 'rls_off' && e.exposed) is.add(`${p}.exposed`, `${name} has RLS off, so it cannot be exposed. Turn RLS on first.`);
    if (!isObj(e.fields)) {
      is.add(`${p}.fields`, 'must be an object.');
      continue;
    }
    for (const [fname, f] of Object.entries(e.fields)) {
      const fp = `${p}.fields.${fname}`;
      if (f.name !== fname) is.add(`${fp}.name`, `must equal the key "${fname}".`);
      if (typeof f.exposed !== 'boolean') is.add(`${fp}.exposed`, 'must be true or false.');
      if (typeof f.pii !== 'boolean') is.add(`${fp}.pii`, 'must be true or false.');
      if (f.enum && !model.enums[f.enum]) is.add(`${fp}.enum`, `enum "${f.enum}" is not defined in enums.`);
      if (f.references && !f.references.entity.includes('.') && !model.entities[f.references.entity]) is.add(`${fp}.references`, `entity "${f.references.entity}" is not in the model.`);
    }
    if (e.displayField && !e.fields[e.displayField]) is.add(`${p}.displayField`, `"${e.displayField}" is not a field of ${name}.`);
  }
  for (const [id, en] of Object.entries(model.enums)) {
    if (!Array.isArray(en.values) || en.values.length === 0) is.add(`enums.${id}.values`, 'must list at least one value.');
    for (const t of en.terminal ?? []) if (!en.values.includes(t)) is.add(`enums.${id}.terminal`, `"${t}" is not one of the values.`);
  }
  model.joins.forEach((j, i) => {
    const from = splitRef(j.from);
    const to = splitRef(j.to);
    if (!from || !to) is.add(`joins[${i}]`, 'from and to must be table.column.');
    else {
      if (!model.entities[from[0]]?.fields[from[1]]) is.add(`joins[${i}].from`, `${j.from} is not in the model.`);
      if (!model.entities[to[0]]?.fields[to[1]]) is.add(`joins[${i}].to`, `${j.to} is not in the model.`);
    }
  });
  return is.result();
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export function validateActions(input: unknown, model?: MorphModel): ValidationResult {
  const is = new Issues();
  if (!isObj(input)) {
    is.add('', 'actions.json must be an object.');
    return is.result();
  }
  if (input.specVersion !== SPEC_VERSION) is.add('specVersion', `must be ${SPEC_VERSION}.`);
  if (typeof input.undoDays !== 'number' || input.undoDays < 1 || input.undoDays > 365) is.add('undoDays', 'must be a number of days from 1 to 365.');
  if (!Array.isArray(input.actions)) {
    is.add('actions', 'must be a list.');
    return is.result();
  }
  const seen = new Set<string>();
  (input.actions as ActionSpec[]).forEach((a, i) => {
    const p = `actions[${i}]`;
    if (!isObj(a)) return is.add(p, 'must be an object.');
    if (seen.has(a.id)) is.add(`${p}.id`, `"${a.id}" is listed twice.`);
    seen.add(a.id);
    if (a.id !== `${a.table}.${a.column}`) is.add(`${p}.id`, `must be "${a.table}.${a.column}".`);
    if (!isIdent(a.table) || !isIdent(a.column)) is.add(p, 'table and column must be plain identifiers.');
    if (a.kind !== 'set_enum' && a.kind !== 'set_fk') is.add(`${p}.kind`, 'v0.1 supports set_enum and set_fk only.');
    if (a.kind === 'set_enum' && (!Array.isArray(a.values) || a.values.length < 2)) is.add(`${p}.values`, 'set_enum needs at least two values.');
    if (a.kind === 'set_fk' && !a.target) is.add(`${p}.target`, 'set_fk needs a target entity.');
    if (!Number.isInteger(a.bulkMax) || a.bulkMax < 1 || a.bulkMax > HARD_BULK_MAX) is.add(`${p}.bulkMax`, `must be a whole number from 1 to ${HARD_BULK_MAX}.`);
    if (typeof a.enabled !== 'boolean') is.add(`${p}.enabled`, 'must be true or false.');
    for (const s of a.sideEffects ?? []) {
      if (!isIdent(s.set) || s.to !== 'now()') is.add(`${p}.sideEffects`, 'side effects set a column to now() only.');
    }
    if (model) {
      const ent = model.entities[a.table];
      if (!ent) is.add(`${p}.table`, `${a.table} is not in the model.`);
      else {
        if (ent.rls === 'rls_off') is.add(`${p}.table`, `${a.table} has RLS off, so it cannot have actions.`);
        const f = ent.fields[a.column];
        if (!f) is.add(`${p}.column`, `${a.id} is not in the model.`);
        else if (!f.exposed) is.add(`${p}.column`, `${a.id} is not exposed.`);
        else if (f.pii) is.add(`${p}.column`, `${a.id} is PII; actions on PII columns are not allowed.`);
        if (!ent.primaryKey) is.add(`${p}.table`, `${a.table} has no primary key, so rows can't be addressed safely.`);
      }
      if (a.kind === 'set_fk' && a.target && !model.entities[a.target.entity]) is.add(`${p}.target`, `${a.target.entity} is not in the model.`);
    }
  });
  return is.result();
}

/* ------------------------------------------------------------------ */
/* Report spec: structure, then semantics against the model (MO-203)   */
/* ------------------------------------------------------------------ */

export function validateReportStructure(input: unknown): ValidationResult {
  const is = new Issues();
  if (!isObj(input)) {
    is.add('', 'A report spec must be an object.');
    return is.result();
  }
  const r = input as Partial<ReportSpec>;
  if (r.specVersion !== SPEC_VERSION) is.add('specVersion', `must be ${SPEC_VERSION}.`);
  if (typeof r.id !== 'string' || !REPORT_ID.test(r.id)) is.add('id', 'must be lowercase letters, digits and dashes, up to 63 characters.');
  if (typeof r.title !== 'string' || !r.title.trim()) is.add('title', 'is required.');
  if (typeof r.source !== 'string' || !isIdent(r.source)) is.add('source', 'must be a table name.');
  if (!Array.isArray(r.fields) || r.fields.length === 0) is.add('fields', 'must list at least one field.');
  if (!Array.isArray(r.widgets) || r.widgets.length === 0) is.add('widgets', 'must list at least one widget.');
  r.widgets?.forEach((w, i) => {
    if (!WIDGET_TYPES.includes(w.type)) is.add(`widgets[${i}].type`, `"${String(w.type)}" is not a widget type. Use one of: ${WIDGET_TYPES.join(', ')}.`);
    if (w.view !== undefined && !WIDGET_VIEWS.includes(w.view)) is.add(`widgets[${i}].view`, 'must be report, act or combined.');
  });
  r.filters?.forEach((f, i) => {
    if (!FILTER_OPS.includes(f.op)) is.add(`filters[${i}].op`, `"${String(f.op)}" is not a filter op.`);
    const needsList = f.op === 'in' || f.op === 'not_in' || f.op === 'between';
    const noValue = f.op === 'is_null' || f.op === 'not_null' || f.op === 'this_month' || f.op === 'this_quarter';
    if (needsList && !Array.isArray(f.value)) is.add(`filters[${i}].value`, `${f.op} needs a list.`);
    if (f.op === 'between' && Array.isArray(f.value) && f.value.length !== 2) is.add(`filters[${i}].value`, 'between needs exactly two values.');
    if (!needsList && !noValue && (f.value === undefined || Array.isArray(f.value))) is.add(`filters[${i}].value`, `${f.op} needs a single value.`);
    if (f.op === 'last_n_days' && (typeof f.value !== 'number' || f.value < 1)) is.add(`filters[${i}].value`, 'last_n_days needs a positive number.');
  });
  r.measures?.forEach((m, i) => {
    if (!MEASURE_FNS.includes(m.fn)) is.add(`measures[${i}].fn`, `"${String(m.fn)}" is not a measure.`);
    if (m.fn !== 'count' && !m.field) is.add(`measures[${i}].field`, `${m.fn} needs a field.`);
  });
  if (r.limit !== undefined && (!Number.isInteger(r.limit) || r.limit < 1)) is.add('limit', 'must be a positive whole number.');
  r.sort?.forEach((s, i) => {
    if (s.dir !== 'asc' && s.dir !== 'desc') is.add(`sort[${i}].dir`, 'must be asc or desc.');
  });
  return is.result();
}

/**
 * Rejects any field not exposed in model.json, any join not in the graph,
 * any measure on a non-numeric field and any action not in actions.json.
 */
export function validateReport(input: unknown, model: MorphModel, actions?: ActionsFile): ValidationResult {
  const structural = validateReportStructure(input);
  if (!structural.ok) return structural;
  const r = input as ReportSpec;
  const is = new Issues();

  const source = model.entities[r.source];
  if (!source) {
    is.add('source', `${r.source} is not in the model.`);
    return is.result();
  }
  if (!source.exposed || source.rls === 'rls_off') {
    is.add('source', source.rls === 'rls_off' ? `${r.source} has RLS off, hidden until you turn RLS on.` : `${r.source} is not exposed.`);
    return is.result();
  }

  const reachable = new Set<string>([r.source]);
  (r.joins ?? []).forEach((j, i) => {
    let parsed;
    try {
      parsed = parseJoin(j);
    } catch (e) {
      return is.add(`joins[${i}]`, (e as Error).message);
    }
    const key1 = `${parsed.from.entity}.${parsed.from.field}`;
    const key2 = `${parsed.to.entity}.${parsed.to.field}`;
    const inGraph = model.joins.some((mj) => (mj.from === key1 && mj.to === key2) || (mj.from === key2 && mj.to === key1));
    if (!inGraph) return is.add(`joins[${i}]`, `${j} is not a join in the model.`);
    if (!reachable.has(parsed.from.entity)) return is.add(`joins[${i}]`, `${parsed.from.entity} must be the source or joined earlier.`);
    if (reachable.has(parsed.to.entity)) return is.add(`joins[${i}]`, `${parsed.to.entity} is joined twice; v0.1 joins each table once.`);
    const target = model.entities[parsed.to.entity];
    if (!target?.exposed || target.rls === 'rls_off') return is.add(`joins[${i}]`, `${parsed.to.entity} is not exposed${target?.rls === 'rls_off' ? ' (RLS off)' : ''}.`);
    reachable.add(parsed.to.entity);
  });

  const derivedKeys = Object.keys(r.derived ?? {});
  const checkColumnRef = (ref: string, path: string): { semantic: string } | null => {
    const parts = splitRef(ref);
    if (!parts) {
      if (derivedKeys.includes(ref)) return { semantic: derivedSemantic(r, ref) };
      is.add(path, `"${ref}" is not a field. Use table.column or a derived field.`);
      return null;
    }
    const [ent, col] = parts;
    if (!reachable.has(ent)) {
      is.add(path, `${ent} is not the source or a joined table.`);
      return null;
    }
    const f = model.entities[ent]?.fields[col];
    if (!f) {
      is.add(path, `${ref} is not in the model.`);
      return null;
    }
    if (!f.exposed) {
      is.add(path, `${ref} is not exposed${f.pii ? ' (PII is off by default)' : ''}.`);
      return null;
    }
    return { semantic: f.semantic };
  };

  for (const [key, d] of Object.entries(r.derived ?? {})) {
    if (!isIdent(key)) is.add(`derived.${key}`, 'derived names must be plain identifiers.');
    const target = 'days_since' in d ? d.days_since : 'bucket' in d ? d.bucket.field : d.date_trunc.field;
    const res = checkColumnRef(target, `derived.${key}`);
    if (res && 'days_since' in d && !['date', 'datetime'].includes(res.semantic)) is.add(`derived.${key}`, 'days_since needs a date or datetime field.');
    if (res && 'date_trunc' in d && !['date', 'datetime'].includes(res.semantic)) is.add(`derived.${key}`, 'date_trunc needs a date or datetime field.');
    if ('bucket' in d && (!Array.isArray(d.bucket.edges) || d.bucket.edges.some((x, i, a) => i > 0 && x <= a[i - 1]!))) is.add(`derived.${key}.bucket.edges`, 'edges must be increasing numbers.');
  }

  const aliases = new Set<string>();
  r.fields.forEach((expr, i) => {
    let p;
    try {
      p = parseFieldExpr(expr, r.source, derivedKeys);
    } catch (e) {
      return is.add(`fields[${i}]`, (e as Error).message);
    }
    if (aliases.has(p.alias)) is.add(`fields[${i}]`, `two fields are named "${p.alias}". Add "as <name>" to one.`);
    aliases.add(p.alias);
    if (!p.derived) checkColumnRef(p.ref, `fields[${i}]`);
  });

  const refOk = (ref: string) => ref.includes('.') || derivedKeys.includes(ref) || aliases.has(ref);
  r.filters?.forEach((f, i) => {
    if (!refOk(f.field)) is.add(`filters[${i}].field`, `"${f.field}" is not a field of this report.`);
    else if (f.field.includes('.')) checkColumnRef(f.field, `filters[${i}].field`);
  });
  [...(r.groupBy ?? []), ...(r.groupByOptions ?? [])].forEach((g, i) => {
    if (!refOk(g)) is.add(`groupBy[${i}]`, `"${g}" is not a field of this report.`);
    else if (g.includes('.')) checkColumnRef(g, `groupBy[${i}]`);
  });
  if ((r.groupBy?.length ?? 0) > 2) is.add('groupBy', 'v0.1 groups by at most two fields.');
  r.measures?.forEach((m, i) => {
    if (!m.field) return;
    if (!refOk(m.field)) return is.add(`measures[${i}].field`, `"${m.field}" is not a field of this report.`);
    const res = m.field.includes('.') ? checkColumnRef(m.field, `measures[${i}].field`) : { semantic: derivedSemantic(r, m.field) };
    if (res && ['sum', 'avg'].includes(m.fn) && !NUMERIC_SEMANTICS.has(res.semantic)) is.add(`measures[${i}]`, `${m.fn} needs a number field; ${m.field} is ${res.semantic}.`);
    if (m.field.includes('.')) {
      const [e, c] = splitRef(m.field)!;
      if (model.entities[e]?.fields[c]?.pii) is.add(`measures[${i}]`, `${m.field} is PII.`);
    }
  });
  r.sort?.forEach((s, i) => {
    if (!refOk(s.field)) is.add(`sort[${i}].field`, `"${s.field}" is not a field of this report.`);
  });
  r.actions?.forEach((id, i) => {
    const [t] = id.split('.');
    if (t !== r.source) is.add(`actions[${i}]`, `${id} acts on ${t}, but this report's source is ${r.source}.`);
    if (actions && !actions.actions.some((a) => a.id === id)) is.add(`actions[${i}]`, `${id} is not in actions.json.`);
  });
  return is.result();
}

function derivedSemantic(r: ReportSpec, key: string): string {
  const d = r.derived?.[key];
  if (!d) return 'text';
  if ('days_since' in d) return 'count';
  if ('bucket' in d) return 'text';
  return 'date';
}
