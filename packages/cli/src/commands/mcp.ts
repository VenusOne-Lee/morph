import type { Io } from './io.js';

/** `morph mcp` delegates to @morph-reports/mcp so the CLI stays small. */
export async function runMcpCommand(opts: { cwd: string; sub: string | null; flags: Record<string, string | boolean> }, io: Io): Promise<number> {
  let mod: { runCli: (o: { cwd: string; sub: string | null; flags: Record<string, string | boolean>; log: (l: string) => void }) => Promise<number> };
  try {
    mod = (await import('@morph-reports/mcp' as string)) as typeof mod;
  } catch {
    io.err(io.bad('Could not load the MCP server. Reinstall with: npm i -D morph-reports'));
    return 1;
  }
  return mod.runCli({ ...opts, log: (l) => io.err(l) });
}
