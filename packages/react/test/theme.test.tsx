import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { fixtureSpecs } from '@morph-reports/testkit';
import { MorphProvider, type SupabaseLike } from '../src/index.js';
import { detectHostTheme, resolveTheme } from '../src/theme.js';

/** A host element with the given CSS variables set on it (jsdom does not cascade custom properties from stylesheets). */
function host(vars: Record<string, string>, style: Partial<CSSStyleDeclaration> = {}) {
  const el = document.createElement('div');
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  Object.assign(el.style, style);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const LOVABLE = { '--primary': '262 72% 54%', '--primary-foreground': '0 0% 100%', '--foreground': '240 10% 10%', '--background': '0 0% 100%', '--card': '0 0% 100%', '--border': '250 15% 91%', '--muted-foreground': '240 5% 45%', '--destructive': '0 72% 51%', '--radius': '1rem' };

describe('host theme detection', () => {
  it('maps a Lovable (shadcn, HSL channel) theme onto Morph tokens by reference', () => {
    const t = detectHostTheme(host(LOVABLE));
    expect(t.source).toBe('shadcn');
    expect(t.vars['--morph-accent']).toBe('hsl(var(--primary))');
    expect(t.vars['--morph-accent-ink']).toBe('hsl(var(--primary-foreground))');
    expect(t.vars['--morph-line']).toBe('hsl(var(--border))');
    expect(t.vars['--morph-ink']).toBe('hsl(var(--foreground))');
    expect(t.vars['--morph-bad']).toBe('hsl(var(--destructive))');
    expect(t.vars['--morph-radius-lg']).toBe('var(--radius)');
    expect(t.vars['--morph-bar-radius']).toContain('var(--radius)');
  });

  it('reads Tailwind v4 full colours and font variables', () => {
    const t = detectHostTheme(host({ '--primary': 'oklch(0.7 0.17 55)', '--border': 'oklch(0.9 0.01 80)', '--font-sans': '"IBM Plex Sans", sans-serif', '--font-mono': '"IBM Plex Mono", monospace' }));
    expect(t.source).toBe('shadcn');
    expect(t.vars['--morph-accent']).toBe('var(--primary)');
    expect(t.vars['--morph-sans']).toBe('var(--font-sans)');
    expect(t.vars['--morph-mono']).toBe('var(--font-mono)');
  });

  it('switches to the distinctUI preset when distinctUI is on the page', () => {
    const t = detectHostTheme(host({ '--dui-black': '#000000', '--dui-font': '"Bricolage Grotesque", sans-serif' }));
    expect(t.source).toBe('distinctui');
    expect(t.vars['--morph-accent']).toContain('--dui-black');
    expect(t.vars['--morph-radius-control']).toContain('9999px');
    expect(t.vars['--morph-shadow']).toBe('none');
  });

  it('falls back to common brand variables and the surrounding font', () => {
    const t = detectHostTheme(host({ '--brand': '#e11d48' }, { fontFamily: 'Inter, sans-serif' }));
    expect(t.source).toBe('brand-vars');
    expect(t.vars['--morph-accent']).toBe('var(--brand)');
    expect(t.vars['--morph-sans']).toContain('Inter');
  });

  it('keeps Morph defaults on a page with nothing to read', () => {
    const t = detectHostTheme(host({}));
    expect(t.source).toBe('none');
    expect(t.vars).toEqual({});
  });

  it('never repaints the semantic good state from host colours', () => {
    const t = detectHostTheme(host({ ...LOVABLE, '--primary': '142 71% 45%' }));
    expect(t.vars['--morph-good']).toBeUndefined();
    expect(t.vars['--morph-good-soft']).toBeUndefined();
  });

  it('keeps Morph light inside a dark host, taking only accent, font and corners', () => {
    const t = detectHostTheme(host({ ...LOVABLE, '--background': '222 47% 11%', '--foreground': '210 40% 98%' }));
    expect(t.darkHost).toBe(true);
    expect(t.vars['--morph-ink']).toBeUndefined();
    expect(t.vars['--morph-surface']).toBeUndefined();
    expect(t.vars['--morph-accent']).toBe('hsl(var(--primary))');
    expect(t.vars['--morph-radius-lg']).toBe('var(--radius)');
  });

  it('lets the app turn detection off or override single tokens', () => {
    const el = host(LOVABLE);
    expect(resolveTheme('morph', el).vars).toEqual({});
    expect(resolveTheme('distinctui', el).source).toBe('distinctui');
    const o = resolveTheme({ accent: '#0f766e', barRadius: '2px', line: '#ddd' }, el).vars;
    expect(o['--morph-accent']).toBe('#0f766e');
    expect(o['--morph-bar-radius']).toBe('2px');
    expect(o['--morph-line']).toBe('#ddd');
    expect(o['--morph-radius-lg']).toBe('var(--radius)');
  });
});

describe('<MorphProvider> theming', () => {
  const specs = fixtureSpecs('crm');
  const supabase = { auth: { getSession: async () => ({ data: { session: null } }) }, rpc: async () => ({ data: null, error: null }), from: () => ({}) } as unknown as SupabaseLike;

  it('reads the element it is mounted in and sets tokens on its root', async () => {
    const el = host(LOVABLE);
    const { container } = render(
      <MorphProvider supabase={supabase} model={specs.model} reports={specs.reports} actions={specs.actions}>
        <p>hi</p>
      </MorphProvider>,
      { container: el },
    );
    const root = container.querySelector('.morph-root') as HTMLElement;
    await waitFor(() => expect(root.dataset.morphTheme).toBe('shadcn'));
    expect(root.style.getPropertyValue('--morph-accent')).toBe('hsl(var(--primary))');
  });

  it('stays on Morph defaults with theme="morph"', async () => {
    const el = host(LOVABLE);
    const { container } = render(
      <MorphProvider supabase={supabase} model={specs.model} reports={specs.reports} actions={specs.actions} theme="morph">
        <p>hi</p>
      </MorphProvider>,
      { container: el },
    );
    const root = container.querySelector('.morph-root') as HTMLElement;
    await waitFor(() => expect(root.dataset.morphTheme).toBe('morph'));
    expect(root.style.getPropertyValue('--morph-accent')).toBe('');
  });
});
