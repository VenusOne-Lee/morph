import { useMorph } from './context.js';
import { isOpen, type ReportMeta, type Row } from './meta.js';

export function describeSource(meta: ReportMeta): string {
  const f = (meta.spec.filters ?? []).map((x) => {
    const field = x.field.includes('.') ? x.field.split('.')[1] : x.field;
    const v = Array.isArray(x.value) ? `(${x.value.join(', ')})` : x.value === undefined ? '' : String(x.value);
    return `${field} ${x.op.replace(/_/g, ' ')} ${v}`.trim();
  });
  return `report: ${meta.spec.id} · ${meta.spec.source}${f.length ? ` where ${f.join(' and ')}` : ''}`;
}

/** Which actions this viewer may use on this report, honouring the `actions` prop and the permission probe. */
export function useAllowedActions(meta: ReportMeta, allow: boolean | string[] | undefined) {
  const m = useMorph();
  const ok = (id: string | undefined) => {
    if (!id || allow === false) return false;
    if (Array.isArray(allow) && !allow.includes(id)) return false;
    return m.canAct(id) === true;
  };
  return { stage: ok(meta.status?.action?.id) ? meta.status!.action! : null, owner: ok(meta.owner?.action?.id) ? meta.owner!.action! : null };
}

export function leastLoaded(meta: ReportMeta, rows: Row[], owners: { id: string; name: string }[], except?: string): { id: string; name: string } | null {
  if (!meta.owner) return null;
  const load = new Map(owners.map((o) => [o.id, 0]));
  for (const r of rows) if (isOpen(meta, r)) load.set(String(r[meta.owner.rawCol]), (load.get(String(r[meta.owner.rawCol])) ?? 0) + 1);
  return owners.filter((o) => o.id !== except).sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.name.localeCompare(b.name))[0] ?? null;
}

