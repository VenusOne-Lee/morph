import { emitKeypressEvents } from 'node:readline';

/**
 * A tiny keyboard-driven checklist for the terminal (MO-109, MO-310).
 * Arrows move, space toggles, `a` toggles a whole group, `/` searches,
 * enter confirms. Locked items can't be toggled.
 */
export interface ListItem {
  id: string;
  group: string;
  label: string;
  detail?: string;
  badges?: string[];
  checked: boolean;
  locked?: string;
}

export interface ListOptions {
  title: string;
  help: string;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  pageSize?: number;
}

const DIM = (s: string) => `\x1b[2m${s}\x1b[22m`;
const BOLD = (s: string) => `\x1b[1m${s}\x1b[22m`;
const ACC = (s: string) => `\x1b[38;2;45;91;234m${s}\x1b[39m`;
const WARN = (s: string) => `\x1b[38;2;181;102;11m${s}\x1b[39m`;
const BAD = (s: string) => `\x1b[38;2;194;57;47m${s}\x1b[39m`;

export function badge(b: string): string {
  if (b === 'PII') return WARN(`[${b}]`);
  if (b.startsWith('RLS')) return BAD(`[${b}]`);
  return ACC(`[${b}]`);
}

export async function checklist(items: ListItem[], opts: ListOptions): Promise<ListItem[]> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  if (!input.isTTY) return items;
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  let cursor = 0;
  let search = '';
  let searching = false;
  const pageSize = opts.pageSize ?? Math.max(8, (output.rows ?? 24) - 6);
  const visible = () => items.filter((i) => !search || `${i.group}.${i.label}`.toLowerCase().includes(search.toLowerCase()));
  let lastLines = 0;

  const render = () => {
    const list = visible();
    if (cursor >= list.length) cursor = Math.max(0, list.length - 1);
    const start = Math.max(0, Math.min(cursor - Math.floor(pageSize / 2), list.length - pageSize));
    const lines: string[] = [BOLD(opts.title), DIM(searching ? `/${search}▏` : opts.help)];
    let lastGroup = '';
    list.slice(start, start + pageSize).forEach((it, k) => {
      const i = start + k;
      if (it.group !== lastGroup) {
        lines.push(DIM(`  ${it.group}`));
        lastGroup = it.group;
      }
      const box = it.locked ? DIM('[-]') : it.checked ? ACC('[x]') : '[ ]';
      const pointer = i === cursor ? ACC('›') : ' ';
      lines.push(`${pointer} ${box} ${it.label.padEnd(24)} ${DIM(it.detail ?? '')} ${(it.badges ?? []).map(badge).join(' ')}${it.locked ? ` ${DIM(it.locked)}` : ''}`);
    });
    output.write(`${lastLines ? `\x1b[${lastLines}A` : ''}\x1b[0J${lines.join('\n')}\n`);
    lastLines = lines.length;
  };

  return new Promise((resolve) => {
    const done = () => {
      input.setRawMode(false);
      input.pause();
      input.off('keypress', onKey);
      resolve(items);
    };
    const onKey = (str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      const list = visible();
      if (key.ctrl && key.name === 'c') {
        input.setRawMode(false);
        output.write('\n');
        process.exit(130);
      }
      if (searching) {
        if (key.name === 'return' || key.name === 'escape') searching = false;
        else if (key.name === 'backspace') search = search.slice(0, -1);
        else if (str && str.length === 1) search += str;
        cursor = 0;
        return render();
      }
      if (key.name === 'up') cursor = Math.max(0, cursor - 1);
      else if (key.name === 'down') cursor = Math.min(list.length - 1, cursor + 1);
      else if (key.name === 'space') {
        const it = list[cursor];
        if (it && !it.locked) it.checked = !it.checked;
      } else if (str === 'a') {
        const it = list[cursor];
        if (it) {
          const group = items.filter((x) => x.group === it.group && !x.locked);
          const all = group.every((x) => x.checked);
          group.forEach((x) => (x.checked = !all));
        }
      } else if (str === '/') {
        searching = true;
        search = '';
      } else if (key.name === 'return') return done();
      render();
    };
    input.on('keypress', onKey);
    render();
  });
}
