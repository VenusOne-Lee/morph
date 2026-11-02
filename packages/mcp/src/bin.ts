#!/usr/bin/env node
import { runCli } from './cli.js';

const args = process.argv.slice(2);
const flags: Record<string, string | boolean> = {};
let sub: string | null = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=', 2);
    if (v !== undefined) flags[k!] = v;
    else if (args[i + 1] && !args[i + 1]!.startsWith('--')) flags[k!] = args[++i]!;
    else flags[k!] = true;
  } else if (!sub) sub = a;
}
runCli({ cwd: process.cwd(), sub, flags, log: (l) => process.stderr.write(`${l}\n`) }).then((code) => process.exit(code));
