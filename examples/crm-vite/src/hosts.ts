import distinctUiCss from '@distinctui/css/distinctui.css?url';

/**
 * Sample host sites for the demo (`?host=...`). Each one is the kind of app Morph
 * gets dropped into: its own fonts, colours and corners, set the way that stack
 * normally sets them. Morph is not told about any of this; it reads it.
 */
export interface Host {
  key: string;
  name: string;
  fonts?: string;
  stylesheet?: string;
  css: string;
  /** Class on <html>, the way the host app would set it. */
  htmlClass?: string;
}

export const HOSTS: Record<string, Host> = {
  plain: {
    key: 'plain',
    name: 'Plain page',
    css: `body{background:#f7f8fa;color:#12141a;font-family:Geist,system-ui,sans-serif}`,
  },
  lovable: {
    key: 'lovable',
    name: 'Pulse CRM',
    // A Lovable app: Tailwind v3 + shadcn/ui, HSL channel variables.
    fonts: 'family=Plus+Jakarta+Sans:wght@400;500;600;700',
    css: `:root{
  --background:0 0% 100%;--foreground:240 10% 10%;--card:0 0% 100%;--card-foreground:240 10% 10%;
  --primary:262 72% 54%;--primary-foreground:0 0% 100%;--secondary:260 30% 96%;
  --muted:260 20% 97%;--muted-foreground:240 5% 45%;--accent:262 80% 96%;--accent-foreground:262 72% 40%;
  --destructive:0 72% 51%;--border:250 15% 91%;--input:250 15% 91%;--ring:262 72% 54%;--radius:1rem}
body{background:hsl(260 30% 98.5%);color:hsl(var(--foreground));font-family:"Plus Jakarta Sans",system-ui,sans-serif}
.host-bar{background:hsl(var(--card));border-bottom:1px solid hsl(var(--border))}
.host-btn{background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-radius:calc(var(--radius) - 4px);padding:8px 14px;font-weight:600}
.host-btn.ghost{background:hsl(var(--secondary));color:hsl(var(--foreground))}`,
  },
  ledger: {
    key: 'ledger',
    name: 'Ledger & Co',
    // Tailwind v4 + shadcn: full oklch colours, square corners, a bright brand.
    fonts: 'family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500',
    css: `:root{
  --background:oklch(0.985 0.004 85);--foreground:oklch(0.24 0.02 60);--card:oklch(1 0 0);
  --primary:oklch(0.7 0.17 55);--primary-foreground:oklch(0.2 0.02 60);
  --muted:oklch(0.96 0.008 80);--muted-foreground:oklch(0.5 0.02 60);
  --destructive:oklch(0.55 0.2 27);--border:oklch(0.9 0.01 80);--radius:0.125rem;
  --font-sans:"IBM Plex Sans",system-ui,sans-serif;--font-mono:"IBM Plex Mono",ui-monospace,monospace}
body{background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.host-bar{background:var(--foreground);color:var(--background)}
.host-btn{background:var(--primary);color:var(--primary-foreground);border-radius:var(--radius);padding:8px 14px;font-weight:600}
.host-btn.ghost{background:transparent;color:var(--background);border:1px solid oklch(0.5 0.02 60)}`,
  },
  distinctui: {
    key: 'distinctui',
    name: 'Version One',
    // distinctUI from npm (@distinctui/css), with its own font.
    fonts: 'family=Bricolage+Grotesque:opsz,wght@12..96,300..800',
    stylesheet: distinctUiCss,
    htmlClass: 'dui-palette-signal',
    css: `body{background:#fff;color:#000;font-family:var(--dui-font)}
.host-bar{border-bottom:1px solid var(--dui-grey-200)}
.host-btn{background:#000;color:#fff;border-radius:9999px;padding:8px 18px;font-weight:500}
.host-btn.ghost{background:#fff;color:#000;border:1px solid #000}`,
  },
};

/** Applies a host's look to the page before React renders. */
export function applyHost(key: string | null): Host {
  const host = HOSTS[key ?? ''] ?? HOSTS.plain!;
  const head = document.head;
  if (host.fonts) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?${host.fonts}&display=swap`;
    head.appendChild(l);
  }
  if (host.stylesheet) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = host.stylesheet;
    head.appendChild(l);
  }
  const s = document.createElement('style');
  s.textContent = `${host.css}
.host-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 24px}
.host-bar b{font-size:17px;letter-spacing:-.01em}
.host-bar nav{display:flex;gap:8px}
.host-btn{border:0;font:inherit;font-size:14px;cursor:pointer}`;
  head.appendChild(s);
  if (host.htmlClass) document.documentElement.classList.add(host.htmlClass);
  return host;
}
