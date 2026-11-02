import pg from 'pg';
import { MorphError, redactString } from '@morph-reports/spec';

export interface RoleCheck {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
}

export interface ScanConnection {
  client: pg.Client;
  role: RoleCheck;
  /** Runs fn inside a read-only transaction (SET LOCAL survives poolers in transaction mode). */
  readOnly<T>(fn: (c: pg.Client) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const READ_ONLY_ROLE_SQL = `-- Create a read-only role for morph init (run once in the SQL editor):
create role morph_scan login password '<choose-a-password>' nosuperuser nobypassrls;
grant usage on schema public to morph_scan;
grant select on all tables in schema public to morph_scan;
alter default privileges in schema public grant select on tables to morph_scan;`;

/**
 * Opens the scan connection (MO-102). Every query runs in a read-only
 * transaction. The connection string is never written anywhere.
 */
export async function connectReadOnly(url: string, opts: { allowSuperuser?: boolean; timeoutMs?: number } = {}): Promise<ScanConnection> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: opts.timeoutMs ?? 10_000, application_name: 'morph-scan' });
  try {
    await client.connect();
  } catch (e) {
    throw new MorphError('connection', `Couldn't connect to the database: ${redactString((e as Error).message)}`, {
      hint: 'Check MORPH_DATABASE_URL (or --url). For hosted Supabase, use the pooler connection string.',
      docsPath: 'connect.md',
    });
  }
  try {
    await client.query('set default_transaction_read_only = on');
  } catch {
    /* poolers may reject session SET; SET LOCAL below still applies */
  }
  const r = await client.query<{ role: string; superuser: boolean; bypass: boolean }>(
    'select current_user as role, rolsuper as superuser, rolbypassrls as bypass from pg_catalog.pg_roles where rolname = current_user',
  );
  const row = r.rows[0]!;
  const role: RoleCheck = { role: row.role, superuser: row.superuser, bypassRls: row.bypass };
  if ((role.superuser || role.bypassRls) && !opts.allowSuperuser) {
    await client.end();
    throw new MorphError('unsafe_config', `The role "${role.role}" can bypass row-level security.`, {
      hint: `Use a read-only role instead, or pass --allow-superuser if you understand the risk.\n\n${READ_ONLY_ROLE_SQL}`,
      docsPath: 'connect.md#read-only-role',
    });
  }
  return {
    client,
    role,
    async readOnly(fn) {
      await client.query('begin read only');
      try {
        await client.query('set local transaction_read_only = on');
        const out = await fn(client);
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => undefined);
        throw e;
      }
    },
    close: () => client.end(),
  };
}
