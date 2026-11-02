import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { MorphError } from '@morph-reports/spec';

export interface StoredSession {
  url: string;
  anonKey: string;
  email: string;
  refreshToken: string;
  savedAt: string;
}

export function sessionPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MORPH_SESSION_FILE) return env.MORPH_SESSION_FILE;
  const base = env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'morph', 'session.json');
}

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Morph only ever runs as a signed-in user. A key that bypasses RLS (a legacy JWT with
 * role service_role, or a new-style secret key) is refused before any request is made.
 */
export function assertPublicKey(key: string): void {
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    throw new MorphError('service_role_refused', 'That key bypasses row level security, so Morph will not use it. Use the anon (publishable) key and sign in as a user.', {
      hint: 'Find the anon key under Project settings → API.',
    });
  }
}

export function saveSession(s: StoredSession, env: NodeJS.ProcessEnv = process.env): string {
  assertPublicKey(s.anonKey);
  const p = sessionPath(env);
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  writeFileSync(p, JSON.stringify(s, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
  return p;
}

export function loadSession(env: NodeJS.ProcessEnv = process.env): StoredSession | null {
  const p = sessionPath(env);
  if (!existsSync(p)) return null;
  const s = JSON.parse(readFileSync(p, 'utf8')) as StoredSession;
  assertPublicKey(s.anonKey);
  return s;
}
