/** Parsing helpers for the dotted references used in specs. */

export interface ParsedField {
  /** `deals.name`, or a derived key such as `days_in_stage`. */
  ref: string;
  entity: string | null;
  field: string;
  /** Column name in the generated view. */
  alias: string;
  derived: boolean;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isIdent(s: string): boolean {
  return IDENT.test(s);
}

/** `users.name as owner` -> { entity: users, field: name, alias: owner } */
export function parseFieldExpr(expr: string, source: string, derivedKeys: string[] = []): ParsedField {
  const m = /^\s*([A-Za-z0-9_.]+)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/i.exec(expr);
  if (!m) throw new Error(`"${expr}" is not a field reference. Use table.column or table.column as alias.`);
  const ref = m[1]!;
  const explicit = m[2];
  if (!ref.includes('.')) {
    if (!derivedKeys.includes(ref)) throw new Error(`"${ref}" is not a derived field. Use table.column.`);
    return { ref, entity: null, field: ref, alias: explicit ?? ref, derived: true };
  }
  const [entity, field, extra] = ref.split('.');
  if (!entity || !field || extra !== undefined) throw new Error(`"${ref}" must be table.column.`);
  const alias = explicit ?? (entity === source ? field : `${entity}_${field}`);
  return { ref, entity, field, alias, derived: false };
}

/** `deals.owner_id -> users.id` */
export function parseJoin(expr: string): { from: { entity: string; field: string }; to: { entity: string; field: string } } {
  const m = /^\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*->\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*$/.exec(expr);
  if (!m) throw new Error(`"${expr}" is not a join. Use table.column -> table.column.`);
  return { from: { entity: m[1]!, field: m[2]! }, to: { entity: m[3]!, field: m[4]! } };
}

export function splitRef(ref: string): [string, string] | null {
  const parts = ref.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

export function humanize(name: string): string {
  const s = name.replace(/_id$/, '').replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
