/**
 * The subset of supabase-js v2 Morph uses at run time. Morph never creates
 * its own client: the builder passes the app's client, signed in as the
 * viewer, so Supabase RLS decides every read and write.
 */

export interface PostgrestErrorLike {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface PostgrestResponseLike<T> {
  data: T | null;
  error: PostgrestErrorLike | null;
  count?: number | null;
  status?: number;
}

export interface FilterBuilderLike<T = Record<string, unknown>[]> extends PromiseLike<PostgrestResponseLike<T>> {
  eq(column: string, value: unknown): FilterBuilderLike<T>;
  neq(column: string, value: unknown): FilterBuilderLike<T>;
  gt(column: string, value: unknown): FilterBuilderLike<T>;
  gte(column: string, value: unknown): FilterBuilderLike<T>;
  lt(column: string, value: unknown): FilterBuilderLike<T>;
  lte(column: string, value: unknown): FilterBuilderLike<T>;
  in(column: string, values: readonly unknown[]): FilterBuilderLike<T>;
  is(column: string, value: null | boolean): FilterBuilderLike<T>;
  not(column: string, operator: string, value: unknown): FilterBuilderLike<T>;
  ilike(column: string, pattern: string): FilterBuilderLike<T>;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): FilterBuilderLike<T>;
  range(from: number, to: number): FilterBuilderLike<T>;
  limit(count: number): FilterBuilderLike<T>;
  abortSignal?(signal: AbortSignal): FilterBuilderLike<T>;
}

export interface QueryBuilderLike {
  select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): FilterBuilderLike;
}

export interface SupabaseLike {
  from(relation: string): QueryBuilderLike;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<PostgrestResponseLike<unknown>>;
  schema?(schema: string): Pick<SupabaseLike, 'from' | 'rpc'>;
  auth?: {
    getSession(): Promise<{ data: { session: { user: { id: string; email?: string } } | null } }>;
  };
}
