import { createInterface } from 'node:readline';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isMorphError, type SupabaseLike } from '@morph-reports/spec';
import { createMorphServer } from './server.js';
import { assertPublicKey, loadSession, saveSession, sessionPath } from './session.js';
import { readProject } from './project.js';

export interface RunCliOptions {
  cwd: string;
  sub: string | null;
  flags: Record<string, string | boolean>;
  /** Logs go to stderr: stdout belongs to the MCP protocol. */
  log: (line: string) => void;
  env?: NodeJS.ProcessEnv;
}

const flag = (o: RunCliOptions, k: string) => (typeof o.flags[k] === 'string' ? (o.flags[k] as string) : undefined);

function client(url: string, key: string): SupabaseClient {
  assertPublicKey(key);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
}

async function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  if (hidden) {
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WritableStream };
    out._writeToOutput = (s: string) => {
      if (s.includes(question)) out.output.write(s);
    };
  }
  const answer = await new Promise<string>((res) => rl.question(question, res));
  rl.close();
  if (hidden) process.stderr.write('\n');
  return answer.trim();
}

/** `morph mcp [login|logout|status]`. With no subcommand, serves MCP over stdio. */
export async function runCli(o: RunCliOptions): Promise<number> {
  const env = o.env ?? process.env;
  try {
    switch (o.sub) {
      case 'login': {
        const url = flag(o, 'url') ?? env.MORPH_SUPABASE_URL ?? env.SUPABASE_URL ?? (await ask('Supabase URL: '));
        const anonKey = flag(o, 'anon-key') ?? env.MORPH_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? (await ask('Anon (publishable) key: '));
        assertPublicKey(anonKey);
        const email = flag(o, 'email') ?? (await ask('Email: '));
        const sb = client(url, anonKey);
        let res;
        if (o.flags['magic-link'] || o.flags.otp) {
          const sent = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
          if (sent.error) {
            o.log(`Could not send the sign-in email: ${sent.error.message}`);
            return 1;
          }
          const token = await ask('We emailed you a sign-in code. Enter it here: ');
          res = await sb.auth.verifyOtp({ email, token, type: 'email' });
        } else {
          const password = env.MORPH_PASSWORD ?? (await ask('Password: ', true));
          res = await sb.auth.signInWithPassword({ email, password });
        }
        const { data, error } = res;
        if (error || !data.session) {
          o.log(`Sign in failed: ${error?.message ?? 'no session returned'}`);
          return 1;
        }
        const p = saveSession({ url, anonKey, email, refreshToken: data.session.refresh_token, savedAt: new Date().toISOString() }, env);
        o.log(`Signed in as ${email}. Session saved to ${p} (readable only by you).`);
        o.log('The MCP server will run as this user, so your RLS policies decide what it can see and change.');
        return 0;
      }
      case 'logout': {
        const p = sessionPath(env);
        const { rmSync } = await import('node:fs');
        rmSync(p, { force: true });
        o.log(`Signed out. Removed ${p}.`);
        return 0;
      }
      case 'status': {
        const s = loadSession(env);
        o.log(s ? `Signed in as ${s.email} on ${s.url} (since ${s.savedAt}).` : 'Not signed in. Run `npx morph-reports mcp login`.');
        return s ? 0 : 1;
      }
      case null:
      case 'serve': {
        const project = readProject(o.cwd);
        const s = loadSession(env);
        const url = env.MORPH_SUPABASE_URL ?? s?.url;
        const key = env.MORPH_SUPABASE_ANON_KEY ?? s?.anonKey;
        const refresh = env.MORPH_REFRESH_TOKEN ?? s?.refreshToken;
        if (!url || !key || !refresh) {
          o.log('Not signed in. Run `npx morph-reports mcp login` first.');
          return 1;
        }
        const sb = client(url, key);
        const { data, error } = await sb.auth.refreshSession({ refresh_token: refresh });
        if (error || !data.session) {
          o.log(`Your saved session has expired (${error?.message ?? 'no session'}). Run \`npx morph-reports mcp login\` again.`);
          return 1;
        }
        // Keep the newest refresh token so the next start still works.
        const persist = (token: string) => {
          if (s && !env.MORPH_REFRESH_TOKEN) saveSession({ ...s, refreshToken: token, savedAt: new Date().toISOString() }, env);
        };
        persist(data.session.refresh_token);
        sb.auth.onAuthStateChange((_event, session) => {
          if (session?.refresh_token) persist(session.refresh_token);
        });
        const { server } = createMorphServer({ project, client: sb as unknown as SupabaseLike });
        await server.connect(new StdioServerTransport());
        o.log(`Morph MCP server running as ${data.session.user.email ?? data.session.user.id} with ${project.reports.length} reports.`);
        return await new Promise<number>(() => undefined);
      }
      default:
        o.log(`Unknown command "mcp ${o.sub}". Try: morph mcp, morph mcp login, morph mcp status, morph mcp logout.`);
        return 2;
    }
  } catch (e) {
    o.log(isMorphError(e) ? `${e.message}${e.hint ? `\n${e.hint}` : ''}` : String(e));
    return isMorphError(e) && e.code === 'service_role_refused' ? 3 : 1;
  }
}
