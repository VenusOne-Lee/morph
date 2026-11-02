/** Small argv parser: `morph <command> [--flag] [--key value] [positional]`. */
export interface ParsedArgs {
  command: string | null;
  flags: Record<string, string | boolean>;
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2) as [string, string | undefined];
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('-') && VALUE_FLAGS.has(k)) flags[k] = argv[++i]!;
      else flags[k] = true;
    } else if (a.startsWith('-') && a.length === 2) {
      const map: Record<string, string> = { y: 'yes', h: 'help', v: 'verbose' };
      flags[map[a[1]!] ?? a[1]!] = true;
    } else if (!command) command = a;
    else positional.push(a);
  }
  return { command, flags, positional };
}

const VALUE_FLAGS = new Set(['url', 'schema', 'dir', 'cwd', 'out', 'stuck-days', 'owner-cap', 'budget', 'report']);

export function flagString(f: ParsedArgs['flags'], k: string): string | undefined {
  const v = f[k];
  return typeof v === 'string' ? v : undefined;
}
