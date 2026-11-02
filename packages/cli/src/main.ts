import { isMorphError, redactString } from '@morph-reports/spec';
import { flagString, parseArgs } from './args.js';
import { createIo, type Io } from './commands/io.js';
import { runInit } from './commands/init.js';
import { runScan } from './commands/scan.js';
import { runDoctor } from './commands/doctor.js';
import { runMigrate } from './commands/migrate.js';
import { t } from './i18n.js';
import { VERSION } from './version.js';

const HELP = `morph ${VERSION} · Reports your customers can act on, with undo.

Usage: npx morph-reports <command> [options]

Commands
  init       Scan your database (read-only) and write morph/ plus one migration
  scan       Re-scan and show what changed, then update morph/
  diff       Show what changed since the last scan, write nothing
  migrate    Regenerate the migration from morph/ (--stdout to print it)
  doctor     Check the migration, views, policies and keys
  mcp        Start the Morph MCP server over stdio (mcp login to sign in)

Options
  --url <conn>         Connection string (or set MORPH_DATABASE_URL). Never saved.
  --schema <a,b>       Schemas to scan (default public)
  -y, --yes            Accept defaults, no prompts
  --dry-run            Write nothing
  --allow-superuser    Allow a role that bypasses RLS (needed to sample values on RLS tables)
  -v, --verbose        Print timings
  -h, --help           Show this help

Exit codes: 0 ok · 1 user error · 2 connection error · 3 unsafe config
Community: https://github.com/VenusOne-Lee/morph/discussions`;

export async function main(argv: string[], io: Io = createIo()): Promise<number> {
  const { command, flags, positional } = parseArgs(argv);
  if (!command || flags.help) {
    io.out(HELP);
    return command ? 0 : flags.help ? 0 : 1;
  }
  if (command === '--version' || flags.version) {
    io.out(VERSION);
    return 0;
  }
  const cwd = flagString(flags, 'cwd') ?? process.cwd();
  const url = flagString(flags, 'url');
  const allowSuperuser = !!flags['allow-superuser'];
  try {
    switch (command) {
      case 'init':
        await runInit(
          {
            cwd,
            ...(url ? { url } : {}),
            yes: !!flags.yes,
            dryRun: !!flags['dry-run'],
            allowSuperuser,
            verbose: !!flags.verbose,
            ...(flagString(flags, 'schema') ? { schemas: flagString(flags, 'schema')!.split(',') } : {}),
            ...(flagString(flags, 'stuck-days') ? { stuckDays: Number(flagString(flags, 'stuck-days')) } : {}),
            ...(flagString(flags, 'owner-cap') ? { ownerCap: Number(flagString(flags, 'owner-cap')) } : {}),
          },
          io,
        );
        return 0;
      case 'scan':
      case 'diff':
        await runScan({ cwd, ...(url ? { url } : {}), yes: !!flags.yes, diffOnly: command === 'diff', allowSuperuser }, io);
        return 0;
      case 'migrate':
        return runMigrate({ cwd, stdout: !!flags.stdout }, io) ? 0 : 1;
      case 'doctor': {
        const checks = await runDoctor({ cwd, ...(url ? { url } : {}), allowSuperuser }, io);
        return checks.some((c) => !c.ok) ? 1 : 0;
      }
      case 'mcp': {
        const { runMcpCommand } = await import('./commands/mcp.js');
        return await runMcpCommand({ cwd, sub: positional[0] ?? null, flags }, io);
      }
      default:
        io.err(io.bad(`Unknown command "${command}".`));
        io.out(HELP);
        return 1;
    }
  } catch (e) {
    if (isMorphError(e)) {
      io.err(io.bad(t('error.prefix', { message: redactString(e.message) })));
      if (e.hint) io.err(io.dim(t('error.hint', { hint: e.hint })));
      return e.code === 'connection' ? 2 : e.code === 'unsafe_config' ? 3 : 1;
    }
    io.err(io.bad(t('error.prefix', { message: redactString((e as Error).message ?? String(e)) })));
    return 1;
  }
}
