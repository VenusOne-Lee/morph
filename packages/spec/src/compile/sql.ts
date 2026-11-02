/** SQL quoting helpers. Identifiers are always quoted; literals are escaped. */

export function qi(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

export function ql(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Numbers in specs must be finite.');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // Standard-conforming string: double the quotes, refuse NUL.
  if (value.includes('\u0000')) throw new Error('Strings in specs cannot contain NUL.');
  return `'${value.replace(/'/g, "''")}'`;
}

export function qref(entity: string, field: string): string {
  return `${qi(entity)}.${qi(field)}`;
}
