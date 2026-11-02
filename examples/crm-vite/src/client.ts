import { createClient } from '@supabase/supabase-js';
import type { SupabaseLike } from '@morph-reports/react';

/**
 * Real mode: your Supabase project with the anon key (never the service-role key).
 * Demo mode (`pnpm demo`): a tiny bridge that replays each query on the local fixture
 * database as the chosen fixture user, the way PostgREST would.
 */
export const demo = import.meta.env.VITE_MORPH_DEMO === '1';

export function realClient() {
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
}

type Call = { m: string; a: unknown[] };

export function demoClient(user: string): SupabaseLike {
  const chain = (calls: Call[]): unknown =>
    new Proxy(() => undefined, {
      get(_t, prop) {
        if (prop === 'then') {
          const p = fetch('/__morph_demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user, calls }) }).then((r) => r.json());
          return p.then.bind(p);
        }
        if (prop === 'auth') {
          return { getSession: () => fetch(`/__morph_demo/session?user=${user}`).then((r) => r.json()) };
        }
        return (...a: unknown[]) => chain([...calls, { m: String(prop), a: a.filter((x) => !(x instanceof AbortSignal)) }]);
      },
    });
  return chain([]) as SupabaseLike;
}
