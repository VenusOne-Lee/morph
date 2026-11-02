import type { ActionPayload } from '../types.js';
import type { SupabaseLike } from './client.js';
import { fromPostgrestError } from './errors.js';

/** One row in a preview, as returned by morph_preview_action. */
export interface PreviewRow {
  id: string;
  display: string | null;
  field: string;
  before: unknown;
  after: unknown;
  version: string;
  /** "already" when the row already has the target value. */
  skipped: 'already' | null;
  sideEffects: Record<string, { before: unknown; after: unknown }>;
}

export interface PreviewResult {
  action: string;
  kind: 'set_enum' | 'set_fk';
  to: string;
  toDisplay: string | null;
  rows: PreviewRow[];
  changed: number;
  bulkMax: number;
  policies: string[];
  undoDays: number;
  undoUntil: string;
  /** Rows the UPDATE policy allowed in the dry run. */
  allowed: number;
  terminal: boolean;
  actor: string | null;
}

export interface ApplyResult {
  auditId: string;
  changed: number;
  rows: { id: string; display: string | null; before: Record<string, unknown>; after: Record<string, unknown> }[];
  undoUntil: string;
}

export interface UndoResult {
  auditId: string;
  restored: number;
  partial: boolean;
  conflicts: { id: string; display: string | null; now: unknown; expected: unknown; changedBy?: string | null; changedAt?: string | null }[];
}

export interface ActionInfo {
  action: string;
  canAct: boolean;
  policies: string[];
}

export interface AuditEntry {
  id: string;
  created_at: string;
  actor: string;
  actor_name: string | null;
  action: string;
  table_name: string;
  row_count: number;
  rows: { id: string; display: string | null; before: Record<string, unknown>; after: Record<string, unknown> }[];
  to_value: string | null;
  to_display: string | null;
  source: 'component' | 'mcp';
  undone_at: string | null;
  undone_by: string | null;
}

async function call<T>(client: SupabaseLike, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await client.rpc(fn, args);
  if (res.error) throw fromPostgrestError(res.error, { relation: fn });
  return res.data as T;
}

export function previewAction(client: SupabaseLike, payload: ActionPayload): Promise<PreviewResult> {
  return call(client, 'morph_preview_action', { action: payload });
}

export function applyAction(client: SupabaseLike, payload: ActionPayload, source: 'component' | 'mcp' = 'component'): Promise<ApplyResult> {
  return call(client, 'morph_apply_action', { action: payload, source });
}

export function undoAction(client: SupabaseLike, auditId: string, opts: { partial?: boolean } = {}): Promise<UndoResult> {
  return call(client, 'morph_undo', { audit_id: auditId, partial: opts.partial ?? false });
}

/** Permission probe (MO-704): can this viewer use this action at all? */
export function actionInfo(client: SupabaseLike, actionId: string): Promise<ActionInfo> {
  return call(client, 'morph_action_info', { action_id: actionId });
}

/** Payload for apply built from a preview, so apply checks the same versions (MO-703). */
export function payloadFromPreview(preview: PreviewResult): ActionPayload {
  const rows = preview.rows.filter((r) => !r.skipped);
  return {
    action: preview.action,
    ids: rows.map((r) => r.id),
    to: preview.to,
    expected: Object.fromEntries(rows.map((r) => [r.id, { value: r.before, version: r.version }])),
  };
}

/**
 * The action log as the viewer may see it (RLS on morph_audit decides).
 * `table` narrows to one source table; `rowId` keeps only entries that touched that record.
 */
export async function listAudit(client: SupabaseLike, opts: { limit?: number; table?: string; rowId?: string } = {}): Promise<AuditEntry[]> {
  let q = client
    .from('morph_audit')
    .select('id,created_at,actor,actor_name,action,table_name,row_count,rows,to_value,to_display,source,undone_at,undone_by');
  if (opts.table) q = q.eq('table_name', opts.table);
  const res = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 50);
  if (res.error) throw fromPostgrestError(res.error, { relation: 'morph_audit' });
  const all = (res.data ?? []) as unknown as AuditEntry[];
  return opts.rowId === undefined ? all : all.filter((a) => a.rows.some((r) => String(r.id) === opts.rowId));
}
