import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MorphError } from '@morph-reports/spec';

export interface ConnectionChoice {
  url: string;
  local: boolean;
  source: 'flag' | 'env' | 'supabase-local';
}

/**
 * Where to connect, in order: --url, MORPH_DATABASE_URL, or a local
 * Supabase stack found through supabase/config.toml. Never saved anywhere.
 */
export function resolveConnection(cwd: string, flagUrl?: string, env = process.env): ConnectionChoice {
  if (flagUrl) return { url: flagUrl, local: isLocal(flagUrl), source: 'flag' };
  if (env.MORPH_DATABASE_URL) return { url: env.MORPH_DATABASE_URL, local: isLocal(env.MORPH_DATABASE_URL), source: 'env' };
  const cfg = join(cwd, 'supabase', 'config.toml');
  if (existsSync(cfg)) {
    const port = /\[db\][^[]*?port\s*=\s*(\d+)/s.exec(readFileSync(cfg, 'utf8'))?.[1] ?? '54322';
    return { url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`, local: true, source: 'supabase-local' };
  }
  throw new MorphError('connection', 'No database to scan.', {
    hint: 'Set MORPH_DATABASE_URL to a read-only connection string, pass --url, or run inside a project with a local Supabase stack (supabase start).',
    docsPath: 'connect.md',
  });
}

function isLocal(url: string): boolean {
  try {
    return ['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
