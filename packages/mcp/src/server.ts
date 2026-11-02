import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  aggregate,
  applyAction,
  compileQuery,
  fetchReportRows,
  isMorphError,
  MorphError,
  payloadFromPreview,
  previewAction,
  redact,
  resolveReport,
  undoAction,
  type ActionPayload,
  type MorphProject,
  type PreviewResult,
  type RuntimeFilter,
  type SupabaseLike,
} from '@morph-reports/spec';
import { VERSION } from './version.js';

export const PREVIEW_TTL_MS = 10 * 60 * 1000;
export const RUN_LIMIT_DEFAULT = 50;
export const RUN_LIMIT_MAX = 500;

interface StoredPreview {
  payload: ActionPayload;
  preview: PreviewResult;
  expires: number;
  used: boolean;
}

export interface MorphMcpOptions {
  project: MorphProject;
  /** A supabase-js client signed in as the user. Never a service-role client. */
  client: SupabaseLike;
  now?: () => number;
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };

function ok(data: Record<string, unknown>, summary: string): ToolResult {
  return { content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}

function fail(e: unknown): ToolResult {
  const err = isMorphError(e) ? e : new MorphError('unknown', e instanceof Error ? e.message : String(e));
  const body = { error: { code: err.code, message: err.message, ...(err.hint ? { hint: err.hint } : {}) } };
  return { content: [{ type: 'text', text: JSON.stringify(redact(body), null, 2) }], isError: true };
}

const filterSchema = z.object({
  field: z.string().describe('Column alias as listed by list_reports'),
  op: z.enum(['=', '!=', 'in', 'not_in', '>', '>=', '<', '<=', 'between', 'is_null', 'not_null', 'contains', 'last_n_days', 'this_month', 'this_quarter']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

/** "Preview: move 2 deals from Lead to Qualified" or "Preview: reassign 2 deals to Ayesha K." */
export function previewSummary(project: MorphProject, p: PreviewResult): string {
  const def = project.actions.actions.find((a) => a.id === p.action);
  const entity = def ? project.model.entities[def.table] : undefined;
  const plural = (entity?.label ?? def?.table ?? 'rows').toLowerCase();
  const noun = p.changed === 1 ? plural.replace(/ies$/, 'y').replace(/s$/, '') : plural;
  const enumId = def ? entity?.fields[def.column]?.enum : undefined;
  const label = (v: unknown) => (enumId ? (project.model.enums[enumId]?.labels[String(v)] ?? String(v)) : String(v));
  const from = [...new Set(p.rows.filter((r) => !r.skipped).map((r) => label(r.before)))];
  const to = p.kind === 'set_enum' ? label(p.to) : (p.toDisplay ?? p.to);
  const verb = p.kind === 'set_fk' ? 'reassign' : 'move';
  const fromText = p.kind === 'set_enum' && from.length === 1 ? ` from ${from[0]}` : '';
  return `Preview: ${verb} ${p.changed} ${noun}${fromText} to ${to}.`;
}

/**
 * Builds the Morph MCP server. Every call runs as the signed-in user, so RLS decides
 * what each tool can read or change. apply_action only accepts a preview_id from
 * preview_action in the last 10 minutes, so an agent always sees the diff first.
 */
export function createMorphServer(opts: MorphMcpOptions): { server: McpServer; previews: Map<string, StoredPreview> } {
  const { project, client } = opts;
  const now = opts.now ?? Date.now;
  const previews = new Map<string, StoredPreview>();
  const server = new McpServer({ name: 'morph', version: VERSION });

  const reportById = (id: string) => {
    const r = project.reports.find((x) => x.id === id);
    if (!r) throw new MorphError('unknown_report', `There is no report called "${id}". Call list_reports to see what exists.`);
    return r;
  };

  server.registerTool(
    'list_reports',
    {
      title: 'List reports',
      description: 'Lists the reports and actions in this Morph project, with each report\'s columns and the actions it allows.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const reports = project.reports.map((spec) => {
        const resolved = resolveReport(spec, project.model, project.actions);
        return {
          id: spec.id,
          title: spec.title,
          why: spec.why ?? null,
          source: spec.source,
          columns: resolved.columns.filter((c) => !c.hidden).map((c) => ({ field: c.alias, label: c.label, semantic: c.semantic })),
          groupBy: spec.groupBy ?? [],
          actions: (spec.actions ?? []).filter((a) => project.actions.actions.some((x) => x.id === a && x.enabled)),
          broken: spec.broken?.reason ?? null,
        };
      });
      const actions = project.actions.actions
        .filter((a) => a.enabled)
        .map((a) => ({ id: a.id, kind: a.kind, table: a.table, column: a.column, values: a.values ?? null, bulkMax: a.bulkMax, target: a.target?.entity ?? null }));
      return ok({ reports, actions, undoDays: project.actions.undoDays }, `${reports.length} reports, ${actions.length} actions.`);
    },
  );

  server.registerTool(
    'run_report',
    {
      title: 'Run a report',
      description: 'Runs a report as the signed-in user and returns its rows (RLS applies) plus group totals when the report is grouped.',
      inputSchema: {
        report: z.string().describe('Report id from list_reports'),
        filters: z.array(filterSchema).optional(),
        limit: z.number().int().min(1).max(RUN_LIMIT_MAX).optional().describe(`Max rows returned, default ${RUN_LIMIT_DEFAULT}`),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ report, filters, limit }) => {
      try {
        const spec = reportById(report);
        const resolved = resolveReport(spec, project.model, project.actions);
        const cap = limit ?? RUN_LIMIT_DEFAULT;
        const res = await fetchReportRows(client, compileQuery(resolved, (filters ?? []) as RuntimeFilter[]), { cap });
        const visible = resolved.columns.filter((c) => !c.hidden || c.alias === '_morph_id');
        const rows = res.rows.map((r) => Object.fromEntries(visible.map((c) => [c.alias, r[c.alias] ?? null])));
        const groupCol = spec.groupBy?.[0] ? resolved.column(spec.groupBy[0])?.alias : undefined;
        const money = resolved.columns.find((c) => c.semantic === 'money');
        let groups: { key: string; count: number; sum?: number }[] | undefined;
        if (groupCol) {
          const agg = aggregate(res.rows, { groupBy: [groupCol], measures: money ? [{ fn: 'count' }, { fn: 'sum', column: money.alias }] : [{ fn: 'count' }] });
          groups = agg.groups.map((g) => ({ key: g.key, count: g.count, ...(money ? { sum: g.values[`sum_${money.alias}`] ?? 0 } : {}) }));
        }
        return ok(
          { report: spec.id, title: spec.title, rowCount: rows.length, capped: res.capped, rows, ...(groups ? { groupBy: groupCol, groups } : {}) },
          `${spec.title}: ${rows.length} rows${res.capped ? ` (capped at ${cap}; add a filter for the rest)` : ''}.`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'preview_action',
    {
      title: 'Preview an action',
      description:
        'Works out what an action would change, as the signed-in user, without writing anything. Returns a preview_id that apply_action accepts for 10 minutes. Show the diff to the person before applying.',
      inputSchema: {
        action: z.string().describe('Action id from list_reports, e.g. "deals.stage"'),
        ids: z.array(z.string()).min(1).describe('Row ids (_morph_id from run_report)'),
        to: z.string().describe('New value: an enum value, or the id of the new owner'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ action, ids, to }) => {
      try {
        const preview = await previewAction(client, { action, ids, to });
        const id = randomUUID();
        for (const [k, v] of previews) if (v.expires < now()) previews.delete(k);
        previews.set(id, { payload: payloadFromPreview(preview), preview, expires: now() + PREVIEW_TTL_MS, used: false });
        const changes = preview.rows.map((r) => ({ id: r.id, name: r.display, field: r.field, before: r.before, after: r.after, skipped: r.skipped }));
        return ok(
          {
            preview_id: id,
            expiresAt: new Date(now() + PREVIEW_TTL_MS).toISOString(),
            action: preview.action,
            to: preview.toDisplay ?? preview.to,
            changed: preview.changed,
            allowed: preview.allowed,
            bulkMax: preview.bulkMax,
            terminal: preview.terminal,
            undoUntil: preview.undoUntil,
            changes,
          },
          `${previewSummary(project, preview)} Nothing has been written. Call apply_action with this preview_id to apply.`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'apply_action',
    {
      title: 'Apply a previewed action',
      description:
        'Applies a preview from preview_action (within 10 minutes) in one transaction, as the signed-in user. Fails if any row changed since the preview. Writes one audit entry; undo stays open for the undo window.',
      inputSchema: { preview_id: z.string().describe('preview_id returned by preview_action') },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ preview_id }) => {
      try {
        const p = previews.get(preview_id);
        if (!p || p.expires < now()) {
          previews.delete(preview_id);
          throw new MorphError('conflict', 'That preview has expired or does not exist. Call preview_action again; previews last 10 minutes.');
        }
        if (p.used) throw new MorphError('conflict', 'That preview was already applied. Call preview_action again to make another change.');
        p.used = true;
        const res = await applyAction(client, p.payload, 'mcp');
        previews.delete(preview_id);
        return ok(
          { audit_id: res.auditId, changed: res.changed, undoUntil: res.undoUntil, rows: res.rows.map((r) => ({ id: r.id, name: r.display, before: r.before, after: r.after })) },
          `Applied to ${res.changed} rows. Undo with audit_id ${res.auditId} until ${res.undoUntil}.`,
        );
      } catch (e) {
        const p = previews.get(preview_id);
        if (p) p.used = false;
        return fail(e);
      }
    },
  );

  server.registerTool(
    'undo',
    {
      title: 'Undo an action',
      description:
        'Puts every field from an applied action back, as the signed-in user. If someone changed a row since, undo stops and says which; pass partial: true to undo the rest.',
      inputSchema: {
        audit_id: z.string().describe('audit_id returned by apply_action'),
        partial: z.boolean().optional().describe('Undo the rows that have not changed since, and leave the others'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ audit_id, partial }) => {
      try {
        const res = await undoAction(client, audit_id, { partial: partial ?? false });
        return ok(
          { audit_id: res.auditId, restored: res.restored, partial: res.partial, conflicts: res.conflicts },
          res.conflicts.length ? `Restored ${res.restored} rows. ${res.conflicts.length} changed since and were left as they are.` : `Undone. ${res.restored} rows restored.`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  return { server, previews };
}
