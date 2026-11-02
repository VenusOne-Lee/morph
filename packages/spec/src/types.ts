/**
 * Morph spec types (v0).
 *
 * Three files describe a Morph project, all committed to the builder's repo:
 *   morph/model.json      the semantic model (what reports may see)
 *   morph/reports/*.json  report specs (what each report shows)
 *   morph/actions.json    the actions viewers may take (set_enum, set_fk)
 */

export const SPEC_VERSION = 0 as const;
export type SpecVersion = typeof SPEC_VERSION;

/* ------------------------------------------------------------------ */
/* Semantic model                                                      */
/* ------------------------------------------------------------------ */

export type SemanticType =
  | 'id'
  | 'fk'
  | 'owner_ref'
  | 'status_enum'
  | 'money'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'count'
  | 'percent'
  | 'number'
  | 'text'
  | 'email'
  | 'phone'
  | 'sa_id_number'
  | 'url'
  | 'json';

/** rls_off tables are blocked; rls_on_no_policies tables show nothing to anyone. */
export type RlsStatus = 'rls_ok' | 'rls_on_no_policies' | 'rls_off';

export interface PolicyRef {
  name: string;
  command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  roles: string[];
}

export interface FieldRef {
  entity: string;
  field: string;
}

export interface ModelField {
  name: string;
  label: string;
  /** Postgres type as `format_type` prints it, e.g. `numeric(12,2)`, `public.deal_stage`. */
  pgType: string;
  semantic: SemanticType;
  nullable: boolean;
  pii: boolean;
  /** Only exposed fields can appear in reports, MCP output or AI prompts. */
  exposed: boolean;
  /** Classifier confidence 0..1 and the reason, so builders can audit the call. */
  confidence: number;
  reason: string;
  /** Enum id in `model.enums` for status_enum fields. */
  enum?: string;
  /** Target of an FK (declared or inferred). */
  references?: FieldRef & { inferred: boolean };
  /** ISO currency inferred from the name (`value_zar` -> ZAR). */
  currency?: string;
}

export interface ModelEntity {
  name: string;
  schema: string;
  label: string;
  kind: 'table' | 'view';
  primaryKey: string | null;
  /** Column used to name a row in previews and audit ("Ubuntu Freight"). */
  displayField: string | null;
  rls: RlsStatus;
  policies: PolicyRef[];
  /** false when the builder hid the whole table, or it is blocked (RLS off). */
  exposed: boolean;
  fields: Record<string, ModelField>;
}

export interface ModelEnum {
  id: string;
  /** Ordered: defines stage order and "next stage". */
  values: string[];
  labels: Record<string, string>;
  /** Values that end the flow (won, lost, closed...). */
  terminal: string[];
  source: 'pg_enum' | 'check' | 'sampled';
}

export interface ModelJoin {
  /** `deals.owner_id` */
  from: string;
  /** `users.id` */
  to: string;
  inferred: boolean;
}

export interface MorphModel {
  $schema?: string;
  specVersion: SpecVersion;
  source: { kind: 'supabase' | 'postgres'; schemas: string[] };
  entities: Record<string, ModelEntity>;
  enums: Record<string, ModelEnum>;
  joins: ModelJoin[];
}

/* ------------------------------------------------------------------ */
/* Report spec                                                         */
/* ------------------------------------------------------------------ */

export type FilterOp =
  | '='
  | '!='
  | 'in'
  | 'not_in'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'between'
  | 'is_null'
  | 'not_null'
  | 'contains'
  | 'last_n_days'
  | 'this_month'
  | 'this_quarter';

export type FilterValue = string | number | boolean | null | Array<string | number>;

export interface ReportFilter {
  field: string;
  op: FilterOp;
  value?: FilterValue;
}

export type MeasureFn = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max';

export interface ReportMeasure {
  fn: MeasureFn;
  /** Required for every fn except count. */
  field?: string;
  as?: string;
  label?: string;
}

export type DerivedField =
  | { days_since: string; approximate?: boolean }
  | { bucket: { field: string; edges: number[]; labels?: string[] } }
  | { date_trunc: { field: string; unit: 'day' | 'week' | 'month' | 'quarter' } };

export type WidgetView = 'report' | 'act' | 'combined';

export type WidgetType =
  | 'bar'
  | 'column'
  | 'funnel'
  | 'workload'
  | 'heatmap'
  | 'kpi'
  | 'table'
  | 'kanban'
  | 'balancer'
  | 'queue'
  | 'kpi-fix';

export interface ReportWidget {
  type: WidgetType;
  view?: WidgetView;
  title?: string;
  /** Free-form widget options: threshold, cap, target, buckets... */
  options?: Record<string, unknown>;
}

export interface ReportSort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface ReportSpec {
  $schema?: string;
  specVersion: SpecVersion;
  id: string;
  title: string;
  /** One line shown under the title and in `list_reports`. */
  why?: string;
  generatedBy?: string;
  source: string;
  /** `deals.owner_id -> users.id` */
  joins?: string[];
  /** `deals.name`, `users.name as owner`, or a derived field key. */
  fields: string[];
  derived?: Record<string, DerivedField>;
  filters?: ReportFilter[];
  groupBy?: string[];
  /** Other group-by choices the viewer can switch to (MO-406). */
  groupByOptions?: string[];
  measures?: ReportMeasure[];
  sort?: ReportSort[];
  limit?: number;
  widgets: ReportWidget[];
  /** Action ids from actions.json usable from this report. */
  actions?: string[];
  /** Set by `morph scan` when the model no longer supports the spec. */
  broken?: { reason: string };
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export type ActionKind = 'set_enum' | 'set_fk';

export interface ActionSideEffect {
  set: string;
  to: 'now()';
}

export interface ActionSpec {
  /** `<table>.<column>` */
  id: string;
  kind: ActionKind;
  table: string;
  column: string;
  label?: string;
  /** set_enum: allowed values in order. */
  values?: string[];
  /** set_enum: terminal values (moving there leaves the open pipeline). */
  terminal?: string[];
  /** set_fk: target entity and its display field. */
  target?: { entity: string; field: string; display: string | null };
  sideEffects?: ActionSideEffect[];
  bulkMax: number;
  enabled: boolean;
  /** UPDATE policies found by the scan, shown in the preview checks. */
  policies?: string[];
}

export interface ActionsFile {
  $schema?: string;
  specVersion: SpecVersion;
  undoDays: number;
  actions: ActionSpec[];
}

/** Payload sent to morph_preview_action / morph_apply_action (MO-702). */
export interface ActionPayload {
  action: string;
  ids: string[];
  to: string;
  /** Row versions from the preview, checked on apply (MO-703). */
  expected?: Record<string, { value: unknown; version: string }>;
}

export const HARD_BULK_MAX = 200;
export const DEFAULT_BULK_MAX = 25;
export const DEFAULT_UNDO_DAYS = 30;
export const DEFAULT_ROW_CAP = 50_000;
