/**
 * MorphError (MO-008): every error carries a code, a plain-English message,
 * a hint that says how to fix it, and a docs link.
 */
export type MorphErrorCode =
  | 'spec_invalid'
  | 'model_invalid'
  | 'actions_invalid'
  | 'field_not_exposed'
  | 'unknown_report'
  | 'unknown_action'
  | 'not_signed_in'
  | 'no_permission'
  | 'view_missing'
  | 'network'
  | 'row_cap'
  | 'conflict'
  | 'bulk_limit'
  | 'value_not_allowed'
  | 'target_not_visible'
  | 'undo_window_closed'
  | 'already_undone'
  | 'service_role_refused'
  | 'connection'
  | 'unsafe_config'
  | 'spec_version'
  | 'unknown';

const DOCS = 'https://github.com/VenusOne-Lee/morph/blob/main/docs';

export class MorphError extends Error {
  readonly code: MorphErrorCode;
  readonly hint: string | undefined;
  readonly docsUrl: string | undefined;
  readonly details: unknown;

  constructor(
    code: MorphErrorCode,
    message: string,
    opts: { hint?: string; docsPath?: string; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'MorphError';
    this.code = code;
    this.hint = opts.hint;
    this.docsUrl = opts.docsPath ? `${DOCS}/${opts.docsPath}` : undefined;
    this.details = opts.details;
  }

  toJSON() {
    return { code: this.code, message: this.message, hint: this.hint, docsUrl: this.docsUrl };
  }
}

export function isMorphError(e: unknown): e is MorphError {
  return e instanceof MorphError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'MorphError');
}

/* ------------------------------------------------------------------ */
/* Redaction: no logged payload ever contains row values or secrets.   */
/* ------------------------------------------------------------------ */

const SECRET_KEYS = /pass(word)?|secret|token|key|authorization|cookie|jwt|session|credential|dsn|url/i;
const ROW_KEYS = new Set(['rows', 'before', 'after', 'value', 'values', 'expected', 'data', 'sample', 'samples', 'top']);
const CONN_STRING = /\b(postgres(?:ql)?|https?):\/\/[^\s'"]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/** Returns a copy safe to log: secrets and row values replaced with markers. */
export function redact(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[…]';
  if (typeof input === 'string') return redactString(input);
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k)) out[k] = '[redacted]';
      else if (ROW_KEYS.has(k)) out[k] = Array.isArray(v) ? `[${v.length} redacted]` : '[redacted]';
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return input;
}

export function redactString(s: string): string {
  return s.replace(CONN_STRING, (m) => `${m.split(':')[0]}://[redacted]`).replace(JWT, '[redacted-jwt]');
}
