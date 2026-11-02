import type { ActionsFile, ModelEntity, ModelField, MorphModel, ReportSpec } from '@morph-reports/spec';
import { SPEC_VERSION, singular, validateReport } from '@morph-reports/spec';

/**
 * Auto report generators (E3). Each one emits a spec only when the model
 * supports it. Candidates are scored and the top 5 to 8 are kept, never two
 * with the same source and group-by (MO-301).
 */

export interface Candidate {
  spec: ReportSpec;
  score: number;
}

export interface GeneratorOptions {
  stuckDays?: number;
  idleDays?: number;
  ownerCap?: number;
  max?: number;
  min?: number;
}

interface Subject {
  e: ModelEntity;
  status: ModelField;
  terminal: string[];
  money: ModelField | null;
  owner: ModelField | null;
  ownerTarget: ModelEntity | null;
  stageTs: { field: ModelField; approximate: boolean } | null;
  created: ModelField | null;
  closed: ModelField | null;
  actions: string[];
}

const lc = (s: string) => s.toLowerCase();
const humanizeOwner = (n: string) => n.replace(/_id$/, '').replace(/_/g, ' ');
const slug = (s: string) => s.replace(/_/g, '-').toLowerCase();

function exposedFields(e: ModelEntity) {
  return Object.values(e.fields).filter((f) => f.exposed && !f.pii);
}

function subjects(model: MorphModel, actions: ActionsFile): Subject[] {
  const out: Subject[] = [];
  const people = peopleEntities(model);
  for (const e of Object.values(model.entities)) {
    if (!e.exposed || e.rls !== 'rls_ok' || !e.primaryKey || people.has(e.name)) continue;
    const fields = exposedFields(e);
    const status = fields.find((f) => f.semantic === 'status_enum' && /stage|status|state|phase/.test(f.name)) ?? fields.find((f) => f.semantic === 'status_enum');
    if (!status?.enum) continue;
    const en = model.enums[status.enum]!;
    const owner = fields.find((f) => f.semantic === 'owner_ref' && f.references && !f.references.entity.includes('.') && model.entities[f.references.entity]?.exposed) ?? null;
    const ts = [`${status.name}_changed_at`, `${status.name}_updated_at`, 'stage_changed_at', 'status_changed_at'].map((n) => e.fields[n]).find((f) => f?.exposed && (f.semantic === 'datetime' || f.semantic === 'date'));
    const updated = e.fields.updated_at?.exposed ? e.fields.updated_at : undefined;
    out.push({
      e,
      status,
      terminal: en.terminal,
      money: fields.find((f) => f.semantic === 'money') ?? null,
      owner,
      ownerTarget: owner ? model.entities[owner.references!.entity]! : null,
      stageTs: ts ? { field: ts, approximate: false } : updated ? { field: updated, approximate: true } : null,
      created: fields.find((f) => f.name === 'created_at' || f.name === 'created') ?? null,
      closed: fields.find((f) => /^(closed|completed|resolved|won)_at$/.test(f.name)) ?? null,
      actions: actions.actions.filter((a) => a.table === e.name && a.enabled).map((a) => a.id),
    });
  }
  // Prefer the richest subject: money, owner, stage timestamp.
  return out.sort((a, b) => richness(b) - richness(a));
}

/** People tables (users, profiles, agents): their role column is not a pipeline. */
function peopleEntities(model: MorphModel): Set<string> {
  const out = new Set<string>();
  for (const e of Object.values(model.entities)) {
    const pk = e.primaryKey ? e.fields[e.primaryKey] : undefined;
    if (pk?.references?.entity === 'auth.users') out.add(e.name);
    for (const f of Object.values(e.fields)) if (f.semantic === 'owner_ref' && f.references && !f.references.entity.includes('.')) out.add(f.references.entity);
  }
  return out;
}

function richness(s: Subject) {
  return (s.money ? 3 : 0) + (s.owner ? 2 : 0) + (s.stageTs && !s.stageTs.approximate ? 2 : s.stageTs ? 1 : 0) + (s.actions.length ? 2 : 0);
}

function base(s: Subject, id: string, title: string, why: string, by: string): ReportSpec {
  return { specVersion: SPEC_VERSION, id, title, why, generatedBy: by, source: s.e.name, fields: [], widgets: [] };
}

function displayFields(s: Subject): { joins: string[]; fields: string[]; ownerAlias: string | null } {
  const fields: string[] = [];
  if (s.e.displayField) fields.push(`${s.e.name}.${s.e.displayField}`);
  fields.push(`${s.e.name}.${s.status.name}`);
  const joins: string[] = [];
  let ownerAlias: string | null = null;
  if (s.owner && s.ownerTarget?.displayField) {
    joins.push(`${s.e.name}.${s.owner.name} -> ${s.ownerTarget.name}.${s.owner.references!.field}`);
    fields.push(`${s.ownerTarget.name}.${s.ownerTarget.displayField} as owner`);
    ownerAlias = 'owner';
  }
  if (s.money) fields.push(`${s.e.name}.${s.money.name}`);
  return { joins, fields, ownerAlias };
}

function openFilter(s: Subject) {
  return s.terminal.length ? [{ field: `${s.e.name}.${s.status.name}`, op: 'not_in' as const, value: s.terminal }] : [];
}

function measures(s: Subject) {
  return [{ fn: 'count' as const }, ...(s.money ? [{ fn: 'sum' as const, field: `${s.e.name}.${s.money.name}` }] : [])];
}

const noun = (s: Subject) => lc(s.e.label);
const one = (s: Subject) => lc(singular(s.e.label));

/* MO-302 */
function pipelineByStage(s: Subject): Candidate | null {
  const d = displayFields(s);
  const spec = base(s, `${slug(s.e.name)}-by-${slug(s.status.name)}`, `${s.e.label} by ${lc(s.status.label)}`, `Open ${noun(s)} in each ${lc(s.status.label)}, in ${lc(s.status.label)} order.`, 'pipeline-by-stage');
  spec.joins = d.joins;
  spec.fields = d.fields;
  if (s.stageTs) {
    spec.derived = { days_in_stage: { days_since: `${s.e.name}.${s.stageTs.field.name}`, ...(s.stageTs.approximate ? { approximate: true } : {}) } };
    spec.fields.push('days_in_stage');
  }
  spec.filters = openFilter(s);
  spec.groupBy = [`${s.e.name}.${s.status.name}`];
  if (d.ownerAlias) spec.groupByOptions = [d.ownerAlias];
  spec.measures = measures(s);
  if (s.stageTs) spec.sort = [{ field: 'days_in_stage', dir: 'desc' }];
  spec.widgets = [{ type: 'bar', view: 'report' }, { type: 'kanban', view: 'combined' }, { type: 'table' }];
  spec.actions = s.actions;
  return { spec, score: 90 + (s.money ? 5 : 0) + (s.actions.length ? 5 : 0) };
}

/* MO-303 */
function stuckRecords(s: Subject, o: Required<GeneratorOptions>): Candidate | null {
  if (!s.stageTs) return null;
  const d = displayFields(s);
  const spec = base(s, `stuck-${slug(s.e.name)}`, `Stuck ${noun(s)}`, `Open ${noun(s)} that haven't moved ${lc(s.status.label)} in over ${o.stuckDays} days, oldest first.`, 'stuck-records');
  spec.joins = d.joins;
  spec.fields = [...d.fields, 'days_in_stage'];
  spec.derived = { days_in_stage: { days_since: `${s.e.name}.${s.stageTs.field.name}`, ...(s.stageTs.approximate ? { approximate: true } : {}) } };
  spec.filters = [...openFilter(s), { field: 'days_in_stage', op: '>', value: o.stuckDays }];
  spec.groupBy = [`${s.e.name}.${s.status.name}`];
  if (d.ownerAlias) spec.groupByOptions = [d.ownerAlias];
  spec.measures = measures(s);
  spec.sort = [{ field: 'days_in_stage', dir: 'desc' }];
  spec.widgets = [
    { type: 'kpi', title: `Stuck ${noun(s)}` },
    { type: 'table' },
    { type: 'queue', view: 'report', options: { threshold: o.stuckDays } },
  ];
  spec.actions = s.actions;
  return { spec, score: 88 + (s.stageTs.approximate ? -6 : 0) + (s.actions.length ? 6 : 0) };
}

/* MO-304 */
function ownerWorkload(s: Subject, o: Required<GeneratorOptions>): Candidate | null {
  if (!s.owner || !s.ownerTarget?.displayField) return null;
  const d = displayFields(s);
  const spec = base(s, `${slug(s.e.name)}-by-owner`, `${singular(s.e.label)} ${lc(humanizeOwner(s.owner.name))} workload`, `Open ${noun(s)} per owner, with a cap of ${o.ownerCap}.`, 'owner-workload');
  spec.joins = d.joins;
  spec.fields = d.fields;
  if (s.stageTs) {
    spec.derived = { days_in_stage: { days_since: `${s.e.name}.${s.stageTs.field.name}`, ...(s.stageTs.approximate ? { approximate: true } : {}) } };
    spec.fields.push('days_in_stage');
  }
  spec.filters = openFilter(s);
  spec.groupBy = ['owner'];
  spec.groupByOptions = [`${s.e.name}.${s.status.name}`];
  spec.measures = measures(s);
  spec.widgets = [{ type: 'workload', view: 'report', options: { cap: o.ownerCap, threshold: o.stuckDays } }, { type: 'balancer', view: 'act', options: { cap: o.ownerCap, threshold: o.stuckDays } }];
  spec.actions = s.actions.filter((a) => a === `${s.e.name}.${s.owner!.name}`);
  return { spec, score: 84 + (spec.actions.length ? 6 : 0) };
}

/* MO-305 */
function trendOverTime(s: Subject): Candidate | null {
  const won = s.terminal.find((t) => /^(won|closed_won|done|completed|resolved|solved|paid|delivered)$/i.test(t));
  const dateField = won && s.closed ? s.closed : s.created;
  if (!dateField) return null;
  const byWon = !!(won && s.closed);
  const title = byWon ? `${s.money ? `${s.status.label === 'Stage' ? 'Won' : enumWord(won!)} value` : `${enumWord(won!)} ${noun(s)}`} by month` : `${s.e.label} created by month`;
  const spec = base(s, byWon ? `${slug(won!)}-${slug(s.e.name)}-by-month` : `${slug(s.e.name)}-by-month`, title, byWon ? `${s.e.label} marked ${lc(enumWord(won!))} in each of the last 6 months.` : `New ${noun(s)} in each of the last 6 months.`, 'trend-over-time');
  spec.fields = [...(s.e.displayField ? [`${s.e.name}.${s.e.displayField}`] : []), `${s.e.name}.${s.status.name}`, ...(s.money ? [`${s.e.name}.${s.money.name}`] : []), 'month'];
  spec.derived = { month: { date_trunc: { field: `${s.e.name}.${dateField.name}`, unit: 'month' } } };
  spec.filters = [...(byWon ? [{ field: `${s.e.name}.${s.status.name}`, op: '=' as const, value: won! }] : []), { field: `${s.e.name}.${dateField.name}`, op: 'last_n_days', value: 183 }];
  spec.groupBy = ['month'];
  spec.measures = byWon && s.money ? [{ fn: 'sum', field: `${s.e.name}.${s.money.name}` }, { fn: 'count' }] : [{ fn: 'count' }];
  spec.sort = [{ field: 'month', dir: 'asc' }];
  spec.widgets = [{ type: 'column', view: 'report', options: { months: 6 } }];
  return { spec, score: 70 + (byWon ? 8 : 0) };
}

function enumWord(v: string) {
  const s = v.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* MO-306 */
function agingHeatmap(s: Subject, o: Required<GeneratorOptions>): Candidate | null {
  if (!s.stageTs) return null;
  const spec = base(s, `${slug(s.e.name)}-aging`, `${s.e.label} aging`, `Open ${noun(s)} by ${lc(s.status.label)} and days in ${lc(s.status.label)}.`, 'aging-heatmap');
  const d = displayFields(s);
  spec.joins = d.joins;
  spec.fields = [...d.fields, 'days_in_stage'];
  spec.derived = { days_in_stage: { days_since: `${s.e.name}.${s.stageTs.field.name}`, ...(s.stageTs.approximate ? { approximate: true } : {}) } };
  spec.filters = openFilter(s);
  spec.groupBy = [`${s.e.name}.${s.status.name}`, 'days_in_stage'];
  spec.measures = [{ fn: 'count' }];
  spec.widgets = [{ type: 'heatmap', view: 'report', options: { buckets: [7, 14, 30], threshold: o.stuckDays } }];
  spec.actions = s.actions;
  return { spec, score: 62 };
}

/* MO-309 */
function idleKpi(s: Subject, o: Required<GeneratorOptions>): Candidate | null {
  if (!s.stageTs) return null;
  const d = displayFields(s);
  const spec = base(s, `idle-${slug(s.e.name)}`, `Idle ${noun(s)}`, `Open ${noun(s)} with no ${lc(s.status.label)} change in over ${o.idleDays} days${s.money ? ', and the value at risk' : ''}.`, 'idle-records');
  spec.joins = d.joins;
  spec.fields = [...d.fields, 'days_in_stage'];
  spec.derived = { days_in_stage: { days_since: `${s.e.name}.${s.stageTs.field.name}`, ...(s.stageTs.approximate ? { approximate: true } : {}) } };
  spec.filters = [...openFilter(s), { field: 'days_in_stage', op: '>', value: o.idleDays }];
  spec.measures = measures(s);
  spec.sort = [{ field: 'days_in_stage', dir: 'desc' }];
  spec.widgets = [{ type: 'kpi-fix', view: 'report', options: { idleDays: o.idleDays } }];
  spec.actions = s.actions;
  return { spec, score: 66 + (s.actions.length ? 4 : 0) };
}

/* MO-307 */
function topRelated(model: MorphModel): Candidate[] {
  const out: Candidate[] = [];
  for (const child of Object.values(model.entities)) {
    if (!child.exposed || child.rls !== 'rls_ok' || !child.primaryKey) continue;
    for (const f of exposedFields(child)) {
      if (f.semantic !== 'fk' || !f.references || f.references.entity.includes('.')) continue;
      const parent = model.entities[f.references.entity];
      if (!parent?.exposed || parent.rls === 'rls_off' || !parent.displayField) continue;
      const money = exposedFields(child).find((x) => x.semantic === 'money');
      const spec: ReportSpec = {
        specVersion: SPEC_VERSION,
        id: `${slug(parent.name)}-by-${slug(child.name)}`,
        title: `${parent.label} by ${one({ e: child } as Subject)} count`,
        why: `Top 10 ${lc(parent.label)} by number of ${lc(child.label)}${money ? ' and their total value' : ''}.`,
        generatedBy: 'top-related',
        source: child.name,
        joins: [`${child.name}.${f.name} -> ${parent.name}.${f.references.field}`],
        fields: [...(child.displayField ? [`${child.name}.${child.displayField}`] : []), `${parent.name}.${parent.displayField} as ${singular(parent.name)}`, ...(money ? [`${child.name}.${money.name}`] : [])],
        groupBy: [singular(parent.name)],
        measures: [{ fn: 'count' }, ...(money ? [{ fn: 'sum' as const, field: `${child.name}.${money.name}` }] : [])],
        widgets: [{ type: 'bar', view: 'report', options: { topN: 10, sortBy: 'count' } }],
      };
      out.push({ spec, score: 50 + (money ? 5 : 0) });
    }
  }
  return out;
}

/* MO-308 */
function newByWeek(model: MorphModel, preferred: string | null): Candidate | null {
  const cands = Object.values(model.entities).filter((e) => e.exposed && e.rls !== 'rls_off' && e.primaryKey && e.fields.created_at?.exposed && ['datetime', 'date'].includes(e.fields.created_at.semantic));
  const e = cands.find((c) => c.name === preferred) ?? cands[0];
  if (!e) return null;
  const spec: ReportSpec = {
    specVersion: SPEC_VERSION,
    id: `new-${slug(e.name)}-by-week`,
    title: `New ${lc(e.label)} by week`,
    why: `${e.label} created in each of the last 12 weeks.`,
    generatedBy: 'new-by-week',
    source: e.name,
    fields: [...(e.displayField ? [`${e.name}.${e.displayField}`] : []), 'week'],
    derived: { week: { date_trunc: { field: `${e.name}.created_at`, unit: 'week' } } },
    filters: [{ field: `${e.name}.created_at`, op: 'last_n_days', value: 84 }],
    groupBy: ['week'],
    measures: [{ fn: 'count' }],
    sort: [{ field: 'week', dir: 'asc' }],
    widgets: [{ type: 'column', view: 'report', options: { weeks: 12 } }],
  };
  return { spec, score: 45 };
}

export function generateReports(model: MorphModel, actions: ActionsFile, options: GeneratorOptions = {}): Candidate[] {
  const o: Required<GeneratorOptions> = { stuckDays: 14, idleDays: 30, ownerCap: 5, max: 8, min: 5, ...options };
  const subs = subjects(model, actions);
  const all: Candidate[] = [];
  subs.forEach((s, i) => {
    const penalty = i * 15; // the richest subject's reports rank first
    for (const c of [pipelineByStage(s), stuckRecords(s, o), ownerWorkload(s, o), trendOverTime(s), idleKpi(s, o), agingHeatmap(s, o)]) {
      if (c) all.push({ ...c, score: c.score - penalty });
    }
  });
  all.push(...topRelated(model));
  const nb = newByWeek(model, subs[0]?.e.name ?? null);
  if (nb) all.push(nb);

  // Valid specs only, ranked, no duplicate (source, groupBy, filters) or id.
  const seen = new Set<string>();
  const ids = new Set<string>();
  const kept: Candidate[] = [];
  for (const c of all.sort((a, b) => b.score - a.score)) {
    if (!validateReport(c.spec, model, actions).ok) continue;
    const key = `${c.spec.source}|${(c.spec.groupBy ?? []).join(',')}|${JSON.stringify(c.spec.filters ?? [])}`;
    if (seen.has(key) || ids.has(c.spec.id)) continue;
    seen.add(key);
    ids.add(c.spec.id);
    kept.push(c);
    if (kept.length >= o.max) break;
  }
  return kept;
}
