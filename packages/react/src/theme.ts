/**
 * Host theming (MO-514). Morph reports should look like part of the app they sit
 * in, not like a widget from somewhere else. On mount the provider reads the
 * styling the host page already has and maps it onto Morph's `--morph-*` tokens:
 *
 * 1. distinctUI (`--dui-*` variables): the distinctUI preset, black and greys.
 * 2. shadcn/ui (Lovable apps, Tailwind v3 HSL channels or v4 full colours):
 *    primary, foreground, card, muted, border, destructive, ring, radius, fonts.
 * 3. Common brand variables (`--color-primary`, `--brand`, Bootstrap, Pico ...).
 * 4. Computed styles of the element Morph is mounted in: font and text colour.
 *
 * Where a host value is a CSS variable, Morph points at it (`var(--primary)`)
 * instead of copying it, so it follows the host if the host changes it later.
 * Anything not found keeps Morph's own default. Guards keep it readable:
 * Morph stays light even inside a dark host (only accent, font and corners are
 * taken), and an accent too pale to read as text gets a darker text shade.
 * Green stays the semantic "good" state in Morph's defaults; a host only
 * changes it by setting `--morph-good` itself.
 */

export type ThemePreset = 'auto' | 'morph' | 'distinctui';

export interface MorphTheme {
  /** `auto` (default) reads the host page; `morph` uses Morph's own look only; `distinctui` forces distinctUI. */
  preset?: ThemePreset;
  accent?: string;
  accentSoft?: string;
  radius?: string;
  fontSans?: string;
  fontMono?: string;
  /** Any other token by short name (`line`, `ink`, `barRadius`) or full name (`--morph-line`). */
  [token: string]: string | undefined;
}

export interface HostTheme {
  /** What Morph recognised on the host page. */
  source: 'distinctui' | 'shadcn' | 'brand-vars' | 'computed' | 'none' | 'morph';
  /** True when the host page is dark and Morph kept its own light surfaces. */
  darkHost: boolean;
  vars: Record<string, string>;
}

/** distinctUI by its published tokens; `var(--dui-*)` first so a host's own edits win. */
const dui = (name: string, fallback: string) => `var(--dui-${name}, ${fallback})`;
export const DISTINCTUI_VARS: Record<string, string> = {
  '--morph-bg': dui('white', '#fff'),
  '--morph-surface': dui('white', '#fff'),
  '--morph-sunken': dui('grey-50', '#fafafa'),
  '--morph-ink': dui('black', '#000'),
  '--morph-ink-2': dui('grey-800', '#262626'),
  '--morph-muted': dui('grey-600', '#6b6b6b'),
  '--morph-line': dui('grey-200', '#e5e5e5'),
  '--morph-accent': dui('black', '#000'),
  '--morph-accent-soft': dui('grey-100', '#f2f2f2'),
  '--morph-accent-ink': dui('white', '#fff'),
  '--morph-accent-text': dui('black', '#000'),
  '--morph-focus': dui('black', '#000'),
  // Charts: the series that matters is black, comparisons grey (distinctUI imagery rules).
  '--morph-series-2': dui('grey-400', '#a3a3a3'),
  '--morph-bar-radius': '8px',
  '--morph-th-bg': 'transparent',
  '--morph-th-line': dui('black', '#000'),
  '--morph-radius': dui('radius-note', '12px'),
  '--morph-radius-lg': dui('radius-card', '22px'),
  '--morph-radius-control': dui('radius-pill', '9999px'),
  '--morph-radius-modal': dui('radius-menu', '24px'),
  '--morph-shadow': 'none',
  '--morph-shadow-modal': dui('shadow-float', '0 8px 30px rgba(0,0,0,.08)'),
  '--morph-sans': dui('font', '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'),
  '--morph-mono': dui('mono', 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'),
};

const SHORT: Record<string, string> = {
  accent: '--morph-accent',
  accentSoft: '--morph-accent-soft',
  accentInk: '--morph-accent-ink',
  accentText: '--morph-accent-text',
  radius: '--morph-radius',
  radiusLg: '--morph-radius-lg',
  radiusControl: '--morph-radius-control',
  barRadius: '--morph-bar-radius',
  fontSans: '--morph-sans',
  fontMono: '--morph-mono',
  series2: '--morph-series-2',
  ink2: '--morph-ink-2',
};

/** Brand variables used by common CSS setups, tried in order when there is no shadcn theme. */
const BRAND_VARS = ['--color-primary', '--brand', '--brand-color', '--color-brand', '--primary-color', '--accent-color', '--color-accent', '--bs-primary', '--pico-primary', '--mantine-primary-color-filled'];

const HSL_CHANNELS = /^-?[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%(\s*\/\s*[\d.]+%?)?$/;
const UA_FONTS = /^("?times( new roman)?"?|serif|-webkit-standard|"?liberation serif"?)(,|$)/i;

type Rgb = [number, number, number];

function isColor(v: string): boolean {
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') return CSS.supports('color', v);
  return /^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color\(|color-mix\()/i.test(v);
}

/** Resolves any CSS colour to sRGB channels, or null where the browser can't say. */
function toRgb(value: string, host: Element): Rgb | null {
  const doc = host.ownerDocument;
  const probe = doc.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  host.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  // oklch/lab come back unconverted in some browsers: let a canvas do the maths.
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = c || value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  } catch {
    return null;
  }
}

function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const WHITE: Rgb = [255, 255, 255];

/** Reads the host page around `el` (the element Morph is mounted in) and returns Morph tokens. */
export function detectHostTheme(el: Element | null | undefined): HostTheme {
  const none: HostTheme = { source: 'none', darkHost: false, vars: {} };
  if (!el || typeof getComputedStyle !== 'function') return none;
  const cs = getComputedStyle(el);
  const raw = (name: string) => cs.getPropertyValue(name).trim();

  if (raw('--dui-black') || raw('--dui-font')) return { source: 'distinctui', darkHost: false, vars: { ...DISTINCTUI_VARS } };

  /** A reference to a host colour variable, in the form that variable needs. */
  const colour = (name: string): string | null => {
    const v = raw(name);
    if (!v) return null;
    if (HSL_CHANNELS.test(v)) return `hsl(var(${name}))`;
    return isColor(v) ? `var(${name})` : null;
  };
  /** The resolved value of a reference, for contrast checks. */
  const resolved = (ref: string) => {
    const name = /var\((--[\w-]+)\)/.exec(ref)?.[1];
    const v = name ? raw(name) : ref;
    return toRgb(HSL_CHANNELS.test(v) ? `hsl(${v})` : v, el);
  };

  const vars: Record<string, string> = {};
  let source: HostTheme['source'] = 'computed';

  const primary = colour('--primary');
  const shadcn = !!primary && (!!raw('--border') || !!raw('--radius') || !!raw('--foreground'));
  let accent: string | null = null;
  let accentInk: string | null = null;

  // The page colour decides whether host surfaces are safe to take (Morph is light only).
  const bgRef = shadcn ? colour('--background') : null;
  let bgRgb = bgRef ? resolved(bgRef) : null;
  if (!bgRgb) {
    const body = el.ownerDocument.body;
    const b = body ? getComputedStyle(body).backgroundColor : '';
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(b);
    if (m && (m[4] === undefined || Number(m[4]) > 0.5)) bgRgb = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const darkHost = !!bgRgb && luminance(bgRgb) < 0.4;

  if (shadcn) {
    source = 'shadcn';
    accent = primary;
    accentInk = colour('--primary-foreground');
    if (!darkHost) {
      const map: [string, string][] = [
        ['--foreground', '--morph-ink'],
        ['--card', '--morph-surface'],
        ['--background', '--morph-bg'],
        ['--muted', '--morph-sunken'],
        ['--muted-foreground', '--morph-muted'],
        ['--border', '--morph-line'],
      ];
      for (const [from, to] of map) {
        const c = colour(from);
        if (c) vars[to] = c;
      }
      if (vars['--morph-ink']) vars['--morph-ink-2'] = `color-mix(in srgb, ${vars['--morph-ink']} 78%, ${vars['--morph-surface'] ?? '#fff'})`;
    }
    const bad = colour('--destructive');
    if (bad) {
      vars['--morph-bad'] = bad;
      vars['--morph-bad-soft'] = `color-mix(in srgb, ${bad} 9%, #fff)`;
    }
    const ring = colour('--ring');
    if (ring) vars['--morph-focus'] = ring;
    if (raw('--radius')) {
      vars['--morph-radius-lg'] = 'var(--radius)';
      vars['--morph-radius'] = 'max(0px, calc(var(--radius) - 2px))';
      vars['--morph-radius-control'] = 'max(0px, calc(var(--radius) - 2px))';
      vars['--morph-radius-modal'] = 'calc(var(--radius) + 4px)';
      vars['--morph-bar-radius'] = 'min(calc(var(--radius) * 0.5), 8px)';
    }
  } else {
    for (const name of BRAND_VARS) {
      const c = colour(name);
      if (c) {
        accent = c;
        source = 'brand-vars';
        break;
      }
    }
  }

  if (accent) {
    vars['--morph-accent'] = accent;
    vars['--morph-accent-soft'] = `color-mix(in srgb, ${accent} 10%, #fff)`;
    if (!vars['--morph-focus']) vars['--morph-focus'] = accent;
    const a = resolved(accent);
    if (!accentInk && a) accentInk = contrast(a, WHITE) >= 3 ? '#fff' : '#0d1726';
    if (accentInk) vars['--morph-accent-ink'] = accentInk;
    // Accent is also text on a pale accent background (badges, chips, tabs).
    if (a && contrast(a, WHITE) < 4.5) vars['--morph-accent-text'] = `color-mix(in oklab, ${accent} 55%, #000)`;
    else vars['--morph-accent-text'] = 'var(--morph-accent)';
  }

  // Fonts: Tailwind v4 variables first, then whatever the host actually renders with.
  const sans = raw('--font-sans');
  const mono = raw('--font-mono');
  if (sans) vars['--morph-sans'] = 'var(--font-sans)';
  else if (cs.fontFamily && !UA_FONTS.test(cs.fontFamily.trim())) vars['--morph-sans'] = cs.fontFamily;
  if (mono) vars['--morph-mono'] = 'var(--font-mono)';

  // Text colour from the page when nothing else said, if it is dark enough for a light UI.
  if (!vars['--morph-ink'] && !darkHost) {
    const ink = toRgb(cs.color, el);
    if (ink && contrast(ink, WHITE) >= 7) {
      vars['--morph-ink'] = cs.color;
      vars['--morph-ink-2'] = `color-mix(in srgb, ${cs.color} 78%, #fff)`;
    }
  }

  if (source === 'computed' && Object.keys(vars).length === 0) return { ...none, darkHost };
  return { source, darkHost, vars };
}

/** Morph tokens for a provider: the host theme (unless turned off), then the app's own overrides. */
export function themeVars(theme: MorphTheme | ThemePreset | undefined, el?: Element | null): Record<string, string> {
  return resolveTheme(theme, el).vars;
}

export function resolveTheme(theme: MorphTheme | ThemePreset | undefined, el?: Element | null): HostTheme {
  const t: MorphTheme = typeof theme === 'string' ? { preset: theme } : (theme ?? {});
  const preset = t.preset ?? 'auto';
  const base: HostTheme =
    preset === 'morph' ? { source: 'morph', darkHost: false, vars: {} } : preset === 'distinctui' ? { source: 'distinctui', darkHost: false, vars: { ...DISTINCTUI_VARS } } : detectHostTheme(el);
  const vars = { ...base.vars };
  for (const [k, v] of Object.entries(t)) {
    if (!v || k === 'preset') continue;
    vars[k.startsWith('--') ? k : (SHORT[k] ?? `--morph-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)] = v;
  }
  return { ...base, vars };
}
