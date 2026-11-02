import { MorphError } from '../errors.js';
import type { PostgrestErrorLike } from './client.js';

/**
 * Maps PostgREST / Postgres errors to MorphErrors (MO-408), so the UI can
 * tell "not signed in" from "no permission" from "migration not applied".
 */
export function fromPostgrestError(err: PostgrestErrorLike, ctx: { relation?: string } = {}): MorphError {
  const code = err.code ?? '';
  const msg = err.message ?? '';
  // Morph's own SQL functions raise with SQLSTATE MO*** and a JSON detail.
  if (/^MO\d{3}$/.test(code)) return morphSqlError(code, msg, err.details ?? null, err.hint ?? null);
  if (code === 'PGRST301' || code === 'PGRST302' || /JWT/i.test(msg)) {
    return new MorphError('not_signed_in', 'You need to sign in to see this report.', { hint: 'Sign in again, then reload.' });
  }
  if (code === '42501') {
    return new MorphError('no_permission', "You don't have permission for this.", { hint: 'Ask an admin for access. Morph follows your app\'s row-level security.' });
  }
  if (code === '42P01' || code === 'PGRST205' || code === '42883' || code === 'PGRST202' || /does not exist|Could not find/i.test(msg)) {
    return new MorphError('view_missing', `${ctx.relation ?? 'A Morph view or function'} isn't in the database yet.`, {
      hint: 'Push the Morph migration (supabase db push), then run `morph doctor`.',
      docsPath: 'cli.md#doctor',
    });
  }
  if (/fetch|network|Failed to fetch|ECONN/i.test(msg)) {
    return new MorphError('network', "Couldn't reach the database.", { hint: 'Check your connection and try again.' });
  }
  return new MorphError('unknown', msg || 'Something went wrong.', { hint: 'Try again. If it keeps happening, run `morph doctor`.' });
}

const SQL_CODES: Record<string, MorphError['code']> = {
  MO001: 'unknown_action',
  MO002: 'bulk_limit',
  MO003: 'value_not_allowed',
  MO004: 'target_not_visible',
  MO005: 'no_permission',
  MO006: 'conflict',
  MO007: 'undo_window_closed',
  MO008: 'already_undone',
  MO009: 'conflict',
  MO010: 'not_signed_in',
  MO011: 'unknown_action',
};

function morphSqlError(code: string, message: string, details: string | null, hint: string | null): MorphError {
  let parsed: unknown = details;
  try {
    parsed = details ? JSON.parse(details) : null;
  } catch {
    /* keep raw */
  }
  return new MorphError(SQL_CODES[code] ?? 'unknown', message, { ...(hint ? { hint } : {}), details: parsed });
}
