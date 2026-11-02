import type { ClientBase } from 'pg';

/** Raw catalog facts for the chosen schemas (MO-103, MO-104). */
export interface Introspection {
  schemas: string[];
  tables: IntroTable[];
  enums: IntroEnum[];
  /** True when `auth.users` exists (a Supabase project). */
  hasAuthUsers: boolean;
}

export interface IntroColumn {
  name: string;
  pgType: string;
  /** `udt` schema-qualified name for enums, e.g. `public.deal_stage`. */
  enumType: string | null;
  nullable: boolean;
  default: string | null;
  ordinal: number;
  /** Values from a `CHECK (col = ANY (ARRAY[...]))` or `IN (...)` constraint. */
  checkValues: string[] | null;
}

export interface IntroForeignKey {
  name: string;
  columns: string[];
  refSchema: string;
  refTable: string;
  refColumns: string[];
}

export interface IntroPolicy {
  name: string;
  command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  roles: string[];
  using: string | null;
  withCheck: string | null;
}

export interface IntroTable {
  schema: string;
  name: string;
  kind: 'table' | 'view';
  columns: IntroColumn[];
  primaryKey: string[];
  uniques: string[][];
  indexes: string[][];
  foreignKeys: IntroForeignKey[];
  rlsEnabled: boolean;
  rlsForced: boolean;
  policies: IntroPolicy[];
  rowEstimate: number;
}

export interface IntroEnum {
  schema: string;
  name: string;
  values: string[];
}

export const SUPABASE_INTERNAL = /^(auth|storage|realtime|extensions|graphql|graphql_public|vault|pgsodium|pgsodium_masks|net|cron|supabase_.*|pgbouncer|_realtime|_analytics|information_schema|pg_.*)$/;

export function defaultSchemas(requested?: string[]): string[] {
  return requested?.length ? requested : ['public'];
}

export async function introspect(db: ClientBase, schemas: string[]): Promise<Introspection> {
  const rel = await db.query<{ schema: string; name: string; relkind: string; rls: boolean; force: boolean; est: number; oid: number }>(
    `select n.nspname as schema, c.relname as name, c.relkind, c.relrowsecurity as rls, c.relforcerowsecurity as force,
            greatest(c.reltuples, 0)::float8 as est, c.oid::int as oid
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1) and c.relkind in ('r', 'p', 'v', 'm')
        and c.relname not like 'morph\\_%'
      order by n.nspname, c.relname`,
    [schemas],
  );
  const oids = rel.rows.map((r) => r.oid);

  const cols = await db.query<{ oid: number; name: string; type: string; enum_type: string | null; notnull: boolean; def: string | null; num: number }>(
    `select a.attrelid::int as oid, a.attname as name, pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
            case when t.typtype = 'e' then tn.nspname || '.' || t.typname end as enum_type,
            a.attnotnull as notnull, pg_catalog.pg_get_expr(d.adbin, d.adrelid) as def, a.attnum as num
       from pg_catalog.pg_attribute a
       join pg_catalog.pg_type t on t.oid = a.atttypid
       join pg_catalog.pg_namespace tn on tn.oid = t.typnamespace
       left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = any($1::oid[]) and a.attnum > 0 and not a.attisdropped
      order by a.attrelid, a.attnum`,
    [oids],
  );

  const cons = await db.query<{ oid: number; name: string; type: string; cols: string[]; ref_schema: string | null; ref_table: string | null; ref_cols: string[] | null; def: string }>(
    `select c.conrelid::int as oid, c.conname as name, c.contype as type,
            array(select a.attname from unnest(c.conkey) with ordinality k(n, i) join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i)::text[] as cols,
            rn.nspname as ref_schema, rc.relname as ref_table,
            case when c.confrelid <> 0 then array(select a.attname from unnest(c.confkey) with ordinality k(n, i) join pg_catalog.pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.i)::text[] end as ref_cols,
            pg_catalog.pg_get_constraintdef(c.oid) as def
       from pg_catalog.pg_constraint c
       left join pg_catalog.pg_class rc on rc.oid = c.confrelid
       left join pg_catalog.pg_namespace rn on rn.oid = rc.relnamespace
      where c.conrelid = any($1::oid[]) and c.contype in ('p', 'u', 'f', 'c')
      order by c.conrelid, c.conname`,
    [oids],
  );

  const idx = await db.query<{ oid: number; cols: string[] }>(
    `select i.indrelid::int as oid,
            array(select a.attname from unnest(i.indkey) with ordinality k(n, o) join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n order by k.o)::text[] as cols
       from pg_catalog.pg_index i where i.indrelid = any($1::oid[])`,
    [oids],
  );

  const pol = await db.query<{ schema: string; table: string; name: string; cmd: string; roles: string[]; qual: string | null; check: string | null }>(
    `select schemaname as schema, tablename as table, policyname as name, cmd, roles::text[] as roles, qual, with_check as check
       from pg_catalog.pg_policies where schemaname = any($1) order by schemaname, tablename, policyname`,
    [schemas],
  );

  const enums = await db.query<{ schema: string; name: string; values: string[] }>(
    `select n.nspname as schema, t.typname as name, array_agg(e.enumlabel order by e.enumsortorder)::text[] as values
       from pg_catalog.pg_type t join pg_catalog.pg_enum e on e.enumtypid = t.oid join pg_catalog.pg_namespace n on n.oid = t.typnamespace
      where n.nspname = any($1) or t.oid in (select a.atttypid from pg_catalog.pg_attribute a where a.attrelid = any($2::oid[]))
      group by n.nspname, t.typname order by 1, 2`,
    [schemas, oids],
  );

  const authUsers = await db.query(`select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and c.relname = 'users'`);

  const tables: IntroTable[] = rel.rows.map((r) => {
    const myCons = cons.rows.filter((c) => c.oid === r.oid);
    const checks = myCons.filter((c) => c.type === 'c');
    return {
      schema: r.schema,
      name: r.name,
      kind: r.relkind === 'v' || r.relkind === 'm' ? 'view' : 'table',
      columns: cols.rows
        .filter((c) => c.oid === r.oid)
        .map((c) => ({
          name: c.name,
          pgType: c.type,
          enumType: c.enum_type,
          nullable: !c.notnull,
          default: c.def,
          ordinal: c.num,
          checkValues: checkValuesFor(c.name, checks.map((k) => k.def)),
        })),
      primaryKey: myCons.find((c) => c.type === 'p')?.cols ?? [],
      uniques: myCons.filter((c) => c.type === 'u').map((c) => c.cols),
      indexes: idx.rows.filter((i) => i.oid === r.oid).map((i) => i.cols),
      foreignKeys: myCons
        .filter((c) => c.type === 'f')
        .map((c) => ({ name: c.name, columns: c.cols, refSchema: c.ref_schema!, refTable: c.ref_table!, refColumns: c.ref_cols ?? [] })),
      rlsEnabled: r.rls,
      rlsForced: r.force,
      policies: pol.rows
        .filter((p) => p.schema === r.schema && p.table === r.name)
        .map((p) => ({ name: p.name, command: p.cmd as IntroPolicy['command'], roles: p.roles, using: p.qual, withCheck: p.check })),
      rowEstimate: Math.round(r.est),
    };
  });

  return {
    schemas,
    tables,
    enums: enums.rows.map((e) => ({ schema: e.schema, name: e.name, values: e.values })),
    hasAuthUsers: (authUsers.rowCount ?? 0) > 0,
  };
}

/**
 * Parses allowed values from check constraints such as
 *   CHECK ((status = ANY (ARRAY['todo'::text, 'done'::text])))
 *   CHECK (status IN ('a', 'b'))
 */
export function checkValuesFor(column: string, defs: string[]): string[] | null {
  const col = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const def of defs) {
    const re = new RegExp(`\\(?\\(?"?${col}"?\\)?(?:::text)?\\s*(?:=\\s*ANY\\s*\\(\\s*(?:\\(\\s*)?ARRAY\\[(.*?)\\]|IN\\s*\\((.*?)\\))`, 'i');
    const m = re.exec(def);
    if (!m) continue;
    const list = m[1] ?? m[2] ?? '';
    const values = [...list.matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]!.replace(/''/g, "'"));
    if (values.length) return values;
  }
  return null;
}
