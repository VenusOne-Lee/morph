import pg from 'pg';
import type { FilterBuilderLike, PostgrestErrorLike, PostgrestResponseLike, SupabaseLike } from '@morph-reports/spec';

/**
 * A supabase-js compatible client that runs every request the way PostgREST
 * does: in its own transaction, as role `authenticated` (or `anon`), with
 * the user's JWT claims in `request.jwt.claims`. RLS decides what it sees.
 *
 * Only the subset Morph uses is implemented. It is a test double for
 * PostgREST, not a replacement: production code uses @supabase/supabase-js.
 */

export interface ViewerUser {
  id: string;
  email?: string;
}

export interface ViewerClientOptions {
  pool: pg.Pool;
  user: ViewerUser | null;
  schema?: string;
}

const qi = (s: string) => `"${s.replace(/"/g, '""')}"`;

type Cond = { sql: (p: (v: unknown) => string) => string };

function toError(e: unknown): PostgrestErrorLike {
  const err = e as { message?: string; code?: string; detail?: string; hint?: string };
  return { message: err.message ?? String(e), code: err.code ?? '', details: err.detail ?? null, hint: err.hint ?? null };
}

async function asViewer<T>(pool: pg.Pool, user: ViewerUser | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${user ? 'authenticated' : 'anon'}`);
    const claims = user ? { sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated' } : { role: 'anon' };
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

class Builder implements FilterBuilderLike {
  private conds: Cond[] = [];
  private orders: string[] = [];
  private offset = 0;
  private max: number | null = null;

  constructor(
    private readonly opts: ViewerClientOptions,
    private readonly schema: string,
    private readonly relation: string,
    private readonly columns: string,
    private readonly countMode: string | undefined,
    private readonly head: boolean,
  ) {}

  private add(fn: Cond['sql']) {
    this.conds.push({ sql: fn });
    return this;
  }
  eq(c: string, v: unknown) {
    return this.add((p) => `${qi(c)} = ${p(v)}`);
  }
  neq(c: string, v: unknown) {
    return this.add((p) => `${qi(c)} <> ${p(v)}`);
  }
  gt(c: string, v: unknown) {
    return this.add((p) => `${qi(c)} > ${p(v)}`);
  }
  gte(c: string, v: unknown) {
    return this.add((p) => `${qi(c)} >= ${p(v)}`);
  }
  lt(c: string, v: unknown) {
    return this.add((p) => `${qi(c)} < ${p(v)}`);
  }
  lte(c: string, v: unknown) {
    return this.add((p) => `${qi(c)} <= ${p(v)}`);
  }
  in(c: string, vs: readonly unknown[]) {
    return this.add((p) => `${qi(c)}::text = any(${p(vs.map(String))}::text[])`);
  }
  is(c: string, v: null | boolean) {
    return this.add(() => `${qi(c)} is ${v === null ? 'null' : v ? 'true' : 'false'}`);
  }
  not(c: string, op: string, v: unknown) {
    if (op === 'is') return this.add(() => `${qi(c)} is not ${v === null ? 'null' : v ? 'true' : 'false'}`);
    if (op === 'in') {
      const list = parseList(String(v));
      return this.add((p) => `not (${qi(c)}::text = any(${p(list)}::text[]))`);
    }
    if (op === 'eq') return this.neq(c, v);
    throw new Error(`testkit: not.${op} is not supported`);
  }
  ilike(c: string, pattern: string) {
    return this.add((p) => `${qi(c)}::text ilike ${p(pattern)}`);
  }
  order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push(`${qi(c)} ${o.ascending === false ? 'desc' : 'asc'} nulls ${o.nullsFirst ? 'first' : 'last'}`);
    return this;
  }
  range(from: number, to: number) {
    this.offset = from;
    this.max = to - from + 1;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  abortSignal() {
    return this;
  }

  private async run(): Promise<PostgrestResponseLike<Record<string, unknown>[]>> {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const cols = this.columns === '*' || !this.columns ? '*' : this.columns.split(',').map((s) => qi(s.trim())).join(', ');
    const where = this.conds.length ? ` where ${this.conds.map((c) => c.sql(p)).join(' and ')}` : '';
    const rel = `${qi(this.schema)}.${qi(this.relation)}`;
    const sql = `select ${cols} from ${rel}${where}${this.orders.length ? ` order by ${this.orders.join(', ')}` : ''}${this.max !== null ? ` limit ${this.max}` : ''}${this.offset ? ` offset ${this.offset}` : ''}`;
    try {
      return await asViewer(this.opts.pool, this.opts.user, async (c) => {
        let count: number | null = null;
        if (this.countMode) {
          const cp: unknown[] = [];
          const cq = (v: unknown) => {
            cp.push(v);
            return `$${cp.length}`;
          };
          const r = await c.query(`select count(*)::int as n from ${rel}${this.conds.length ? ` where ${this.conds.map((x) => x.sql(cq)).join(' and ')}` : ''}`, cp);
          count = r.rows[0].n;
        }
        if (this.head) return { data: null, error: null, count, status: 200 };
        const r = await c.query({ text: sql, values: params, types: { getTypeParser: jsonTypes } });
        return { data: r.rows, error: null, count, status: 200 };
      });
    } catch (e) {
      return { data: null, error: toError(e), count: null, status: 400 };
    }
  }

  then<R1 = PostgrestResponseLike<Record<string, unknown>[]>, R2 = never>(
    onfulfilled?: ((value: PostgrestResponseLike<Record<string, unknown>[]>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/**
 * PostgREST returns JSON: numerics as numbers, timestamps as ISO strings.
 * Mirror that so tests see the same shapes the browser does.
 */
function jsonTypes(oid: number, format?: string): (v: string) => unknown {
  void format;
  switch (oid) {
    case 1700: // numeric
    case 700:
    case 701:
    case 20: // int8
      return (v: string) => Number(v);
    case 1114:
    case 1184: // timestamptz
      return (v: string) => new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString();
    case 1082: // date
      return (v: string) => v;
    default:
      return pg.types.getTypeParser(oid, 'text') as (v: string) => unknown;
  }
}

function parseList(s: string): string[] {
  const inner = s.trim().replace(/^\(/, '').replace(/\)$/, '');
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (q) {
      if (ch === '\\') cur += inner[++i] ?? '';
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (inner.length) out.push(cur);
  return out;
}

const fnArgCache = new WeakMap<pg.Pool, Map<string, { name: string; type: string }[]>>();

async function fnArgs(pool: pg.Pool, schema: string, fn: string) {
  let cache = fnArgCache.get(pool);
  if (!cache) fnArgCache.set(pool, (cache = new Map()));
  const key = `${schema}.${fn}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await pool.query(
    `select unnest(p.proargnames) as name, format_type(unnest(p.proargtypes::oid[]), null) as type
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`,
    [schema, fn],
  );
  const args = r.rows as { name: string; type: string }[];
  cache.set(key, args);
  return args;
}

export function createViewerClient(opts: ViewerClientOptions): SupabaseLike {
  const make = (schema: string): Pick<SupabaseLike, 'from' | 'rpc'> => ({
    from(relation: string) {
      return {
        select(columns = '*', o: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean } = {}) {
          return new Builder(opts, schema, relation, columns, o.count, o.head ?? false);
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      try {
        const known = await fnArgs(opts.pool, schema, fn);
        if (!known.length && !(await opts.pool.query('select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2', [schema, fn])).rowCount) {
          return { data: null, error: { message: `Could not find the function ${schema}.${fn}`, code: 'PGRST202' }, status: 404 };
        }
        const names = Object.keys(args);
        const params: unknown[] = [];
        const parts = names.map((n) => {
          const t = known.find((k) => k.name === n)?.type ?? 'text';
          const v = args[n];
          params.push(t === 'jsonb' || t === 'json' ? JSON.stringify(v) : v);
          return `${qi(n)} => $${params.length}::${t}`;
        });
        const r = await asViewer(opts.pool, opts.user, (c) => c.query(`select ${qi(schema)}.${qi(fn)}(${parts.join(', ')}) as result`, params));
        return { data: r.rows[0]?.result ?? null, error: null, status: 200 };
      } catch (e) {
        return { data: null, error: toError(e), status: 400 };
      }
    },
  });
  const root = make(opts.schema ?? 'public');
  return {
    ...root,
    schema: (s: string) => make(s),
    auth: {
      async getSession() {
        return { data: { session: opts.user ? { user: { id: opts.user.id, ...(opts.user.email ? { email: opts.user.email } : {}) } } : null } };
      },
    },
  };
}
