/** Output helpers. Colours follow the Morph palette and switch off when not a TTY. */
export interface Io {
  out(line: string): void;
  err(line: string): void;
  interactive: boolean;
  dim(s: string): string;
  good(s: string): string;
  warn(s: string): string;
  bad(s: string): string;
  accent(s: string): string;
  ask(question: string): Promise<string>;
}

export function createIo(opts: { color?: boolean; interactive?: boolean } = {}): Io {
  const color = opts.color ?? (process.stdout.isTTY && !process.env.NO_COLOR);
  const wrap = (open: string, close: string) => (s: string) => (color ? `\x1b[${open}m${s}\x1b[${close}m` : s);
  return {
    out: (l) => process.stdout.write(`${l}\n`),
    err: (l) => process.stderr.write(`${l}\n`),
    interactive: opts.interactive ?? (!!process.stdin.isTTY && !!process.stdout.isTTY),
    dim: wrap('2', '22'),
    good: wrap('38;2;18;128;92', '39'),
    warn: wrap('38;2;181;102;11', '39'),
    bad: wrap('38;2;194;57;47', '39'),
    accent: wrap('38;2;45;91;234', '39'),
    async ask(q) {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(q);
      } finally {
        rl.close();
      }
    },
  };
}

/** Collects output for tests. */
export function memoryIo(answers: string[] = []): Io & { lines: string[] } {
  const lines: string[] = [];
  const id = (s: string) => s;
  return {
    lines,
    out: (l) => lines.push(l),
    err: (l) => lines.push(l),
    interactive: false,
    dim: id,
    good: id,
    warn: id,
    bad: id,
    accent: id,
    ask: async () => answers.shift() ?? '',
  };
}
