import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * MO-006: returns every runtime source file that mentions the Supabase
 * service-role key. Runtime packages must never read it.
 */
export function findServiceRoleUsage(dirs: string[]): string[] {
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name === 'dist' || name === 'test') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\./.test(name)) {
        const text = readFileSync(p, 'utf8');
        if (/SUPABASE_SERVICE_ROLE_KEY|service_role_key|serviceRoleKey/.test(text) && !/morph-allow-service-role-mention/.test(text)) hits.push(p);
      }
    }
  };
  for (const d of dirs) walk(d);
  return hits;
}
