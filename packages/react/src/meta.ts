import type { ActionSpec, MorphProject, ReportSpec, ResolvedReport } from '@morph-reports/spec';
import { ID_COLUMN, resolveReport, VERSION_COLUMN } from '@morph-reports/spec';

export interface MorphConfig {
  stuckDays: number;
  idleDays: number;
  ownerCap: number;
  rowCap: number;
  locale: string;
}

export const DEFAULT_CONFIG: MorphConfig = { stuckDays: 14, idleDays: 30, ownerCap: 5, rowCap: 50_000, locale: 'en-ZA' };

export interface StatusMeta {
  col: string;
  values: string[];
  labels: Record<string, string>;
  open: string[];
  terminal: string[];
  action: ActionSpec | null;
}

export interface OwnerMeta {
  /** Display column (e.g. `owner`). */
  col: string | null;
  /** Raw FK column (e.g. `owner_id`). */
  rawCol: string;
  action: ActionSpec | null;
}

/** What the renderer needs to know about a report's columns. */
export interface ReportMeta {
  spec: ReportSpec;
  resolved: ResolvedReport;
  idCol: string;
  versionCol: string;
  displayCol: string | null;
  status: StatusMeta | null;
  owner: OwnerMeta | null;
  money: { col: string; currency?: string } | null;
  days: { col: string; approximate: boolean } | null;
  stuckDays: number;
  ownerCap: number;
  idleDays: number;
  noun: string;
}

export function buildMeta(project: MorphProject, spec: ReportSpec, config: MorphConfig): ReportMeta {
  const resolved = resolveReport(spec, project.model, project.actions);
  const source = project.model.entities[spec.source]!;
  const cols = resolved.columns;
  const actions = project.actions.actions.filter((a) => a.enabled && (spec.actions ?? []).includes(a.id));

  const statusCol = cols.find((c) => c.entity === spec.source && c.semantic === 'status_enum' && c.enumId);
  let status: StatusMeta | null = null;
  if (statusCol?.enumId) {
    const en = project.model.enums[statusCol.enumId]!;
    status = {
      col: statusCol.alias,
      values: en.values,
      labels: en.labels,
      terminal: en.terminal,
      open: en.values.filter((v) => !en.terminal.includes(v)),
      action: actions.find((a) => a.kind === 'set_enum' && a.column === statusCol.field) ?? null,
    };
  }

  const ownerAction = actions.find((a) => a.kind === 'set_fk') ?? null;
  const ownerField = Object.values(source.fields).find((f) => f.semantic === 'owner_ref' && (!ownerAction || f.name === ownerAction.column));
  let owner: OwnerMeta | null = null;
  if (ownerField) {
    const raw = cols.find((c) => c.entity === spec.source && c.field === ownerField.name);
    const target = ownerField.references?.entity;
    const display = target ? cols.find((c) => c.entity === target && c.field === project.model.entities[target]?.displayField) : undefined;
    if (raw || display) owner = { col: display?.alias ?? null, rawCol: raw?.alias ?? ownerField.name, action: ownerAction };
  }

  const money = cols.find((c) => c.semantic === 'money' && !c.hidden) ?? cols.find((c) => c.semantic === 'money');
  const days = cols.find((c) => c.derived && 'days_since' in c.derived);
  const widgetOpt = (k: string) => spec.widgets.map((w) => w.options?.[k]).find((v) => typeof v === 'number') as number | undefined;

  return {
    spec,
    resolved,
    idCol: ID_COLUMN,
    versionCol: VERSION_COLUMN,
    displayCol: resolved.displayAlias,
    status,
    owner,
    money: money ? { col: money.alias, ...(money.currency ? { currency: money.currency } : {}) } : null,
    days: days ? { col: days.alias, approximate: days.label.includes('approximate') } : null,
    stuckDays: widgetOpt('threshold') ?? config.stuckDays,
    ownerCap: widgetOpt('cap') ?? config.ownerCap,
    idleDays: widgetOpt('idleDays') ?? config.idleDays,
    noun: source.label.toLowerCase(),
  };
}

export type Row = Record<string, unknown>;

export function isOpen(meta: ReportMeta, row: Row): boolean {
  return !meta.status || !meta.status.terminal.includes(String(row[meta.status.col]));
}

export function isStuck(meta: ReportMeta, row: Row): boolean {
  return !!meta.days && isOpen(meta, row) && Number(row[meta.days.col]) > meta.stuckDays;
}

export function rowName(meta: ReportMeta, row: Row): string {
  return String((meta.displayCol && row[meta.displayCol]) ?? row[meta.idCol] ?? '');
}

export function nextStage(meta: ReportMeta, current: string): string | null {
  if (!meta.status) return null;
  const v = meta.status.values;
  const i = v.indexOf(current);
  const next = v.slice(i + 1).find((x) => !meta.status!.terminal.includes(x)) ?? v.slice(i + 1)[0] ?? null;
  return next;
}

/** First "positive" terminal value (won, done) and first "negative" one (lost, cancelled). */
export function terminalPair(meta: ReportMeta): { win: string | null; lose: string | null } {
  const t = meta.status?.terminal ?? [];
  return {
    win: t.find((x) => /won|done|complete|resolved|solved|paid|delivered|shipped/i.test(x)) ?? t[0] ?? null,
    lose: t.find((x) => /lost|cancel|closed|rejected|declined|churn|archiv/i.test(x)) ?? t[1] ?? null,
  };
}
