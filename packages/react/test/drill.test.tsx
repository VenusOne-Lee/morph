import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { createFixtureDb, fixtureSpecs, FIXTURES_DIR, type FixtureDb } from '@morph-reports/testkit';
import { MorphDashboard, MorphProvider, MorphRecord, MorphReport, FunnelWidget } from '../src/index.js';

let db: FixtureDb;
const specs = fixtureSpecs('crm');

beforeAll(async () => {
  db = await createFixtureDb('crm');
  const dir = join(FIXTURES_DIR, 'crm', 'supabase', 'migrations');
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
});
afterEach(() => cleanup());
afterAll(async () => {
  await db?.drop();
});

function app(user: string, children: React.ReactNode, extra: Partial<React.ComponentProps<typeof MorphProvider>> = {}) {
  return render(
    <MorphProvider supabase={db.as(user)} model={specs.model} reports={specs.reports} actions={specs.actions} {...extra}>
      {children}
    </MorphProvider>,
  );
}

async function a11y(el: HTMLElement) {
  const res = await axe.run(el, { rules: { 'color-contrast': { enabled: false } } });
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const countIn = (s: string | null | undefined) => Number(/(\d+)/.exec(s ?? '')?.[1] ?? NaN);

describe('drill-down from a dashboard number', () => {
  it('opens the records behind a KPI, then one record, and walks back with Escape', async () => {
    const { unmount } = app('manager', <MorphDashboard title="Sales" />);
    const tile = await screen.findByRole('button', { name: /^Stuck over 14 days: \d+/ });
    const tileCount = countIn(tile.getAttribute('aria-label')?.split(':')[1]);
    fireEvent.click(tile);

    const sheet = await screen.findByRole('dialog', { name: 'Stuck over 14 days' });
    await waitFor(() => expect(sheet.querySelectorAll('.morph-drill-row').length).toBe(tileCount));
    const rows = sheet.querySelectorAll('.morph-drill-row');
    expect(within(sheet).getByText(new RegExp(`^${tileCount} deals`))).toBeTruthy();
    expect(await a11y(sheet)).toEqual([]);

    // Oldest first, so the first row is the one most overdue.
    const days = [...rows].map((r) => Number(r.querySelector('.morph-age b')?.textContent));
    expect(days).toEqual([...days].sort((a, b) => b - a));

    const name = rows[0]!.querySelector('.name b')!.textContent!;
    fireEvent.click(rows[0]!);
    expect(await within(sheet).findByRole('heading', { name })).toBeTruthy();
    expect(within(sheet).getByText(`1 of ${tileCount}`)).toBeTruthy();
    expect(within(sheet).getByText('Stuck')).toBeTruthy();
    expect(await a11y(sheet)).toEqual([]);

    fireEvent.click(within(sheet).getByRole('button', { name: 'Next record' }));
    expect(within(sheet).getByText(`2 of ${tileCount}`)).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await within(sheet).findByRole('heading', { name: 'Stuck over 14 days' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(tile));
    unmount();
  });

  it('only lists what the viewer can see: a rep drills into their own deals', async () => {
    const { unmount } = app('rep', <MorphDashboard title="Sales" />);
    const tile = await screen.findByRole('button', { name: /^Open: \d+/ });
    const n = countIn(tile.getAttribute('aria-label')?.split(':')[1]);
    expect(n).toBeLessThan(15);
    fireEvent.click(tile);
    const sheet = await screen.findByRole('dialog', { name: 'Open' });
    await waitFor(() => expect(sheet.querySelectorAll('.morph-drill-row').length).toBe(n));
    expect(await within(sheet).findByText(/read as Sipho/)).toBeTruthy();
    unmount();
  });

  it('a funnel step opens the open deals in that stage', async () => {
    const { unmount } = app('manager', <FunnelWidget report="deals-by-stage" widget={{ type: 'funnel' }} />);
    const step = await screen.findByRole('button', { name: /^Proposal, \d+/ });
    const n = countIn(step.getAttribute('aria-label')?.split(',')[1]);
    fireEvent.click(step);
    const sheet = await screen.findByRole('dialog', { name: 'Proposal' });
    await waitFor(() => expect(sheet.querySelectorAll('.morph-drill-row').length).toBe(n));
    for (const r of sheet.querySelectorAll('.morph-drill-row .sub')) expect(r.textContent).toMatch(/^Proposal/);
    unmount();
  });
});

describe('record view from a report row', () => {
  it('moves the deal from the record, shows it in history, and undoes it there', async () => {
    const { unmount } = app('manager', <MorphReport report="deals-by-stage" />);
    await screen.findByText(/15 of 15 deals shown/);
    fireEvent.click(screen.getByRole('button', { name: 'Soweto Bakers' }));

    const sheet = await screen.findByRole('dialog', { name: 'Soweto Bakers' });
    expect(within(sheet).getByText(/of 15$/)).toBeTruthy();
    await within(sheet).findByText('No Morph actions on this record yet.');
    const move = await within(sheet).findByLabelText('Move to');
    expect((move as HTMLSelectElement).value).toBe('qualified');
    // Escape belongs to the preview while it is open.
    const preview = await waitFor(() => within(sheet).getAllByRole('button', { name: 'Preview' })[0]!);
    await waitFor(() => expect((preview as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(preview);

    const modal = await screen.findByRole('dialog', { name: /Move 1 deal/ });
    const apply = await within(modal).findByRole('button', { name: /Apply to 1 row/ });
    await act(async () => fireEvent.click(apply));
    await screen.findByText(/Moved 1 deal to/);
    expect(screen.getByRole('dialog', { name: 'Soweto Bakers' })).toBeTruthy();

    expect((await db.adminPool.query(`select stage from deals where name = 'Soweto Bakers'`)).rows[0].stage).toBe('qualified');
    const item = await within(sheet).findByText('Moved from Lead to Qualified');
    expect(within(sheet).getAllByText('Qualified').length).toBeGreaterThan(0);

    await act(async () => fireEvent.click(within(item.closest('li')!).getByRole('button', { name: 'Undo' })));
    await within(sheet).findByText('Undone');
    expect((await db.adminPool.query(`select stage from deals where name = 'Soweto Bakers'`)).rows[0].stage).toBe('lead');
    unmount();
  });

  it('hands the row to onRowClick instead when the builder routes to their own page', async () => {
    const onRowClick = vi.fn();
    const { unmount } = app('manager', <MorphReport report="deals-by-stage" actions={false} onRowClick={onRowClick} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Soweto Bakers' }));
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Soweto Bakers' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
  });

  it('shows Open in app when the provider has recordHref, and hides actions when actions={false}', async () => {
    const { unmount } = app('manager', <MorphReport report="deals-by-stage" actions={false} />, { recordHref: (_r, c) => `/deals/${c.id}` });
    fireEvent.click(await screen.findByRole('button', { name: 'Soweto Bakers' }));
    const sheet = await screen.findByRole('dialog', { name: 'Soweto Bakers' });
    expect(within(sheet).getByRole('link', { name: /Open in app/ }).getAttribute('href')).toMatch(/^\/deals\/.+/);
    expect(within(sheet).queryByLabelText('Move to')).toBeNull();
    unmount();
  });
});

describe('<MorphRecord> on a page of your own', () => {
  it('renders one record through the report view, and says so when RLS hides it', async () => {
    const id = String((await db.adminPool.query(`select id from deals where name = 'Ubuntu Freight'`)).rows[0].id);
    const r1 = app('manager', <MorphRecord report="deals-by-stage" id={id} />);
    expect(await screen.findByRole('heading', { name: 'Ubuntu Freight' })).toBeTruthy();
    expect(await a11y(r1.container)).toEqual([]);
    r1.unmount();

    const owner = String((await db.adminPool.query(`select u.name from deals d join users u on u.id = d.owner_id where d.name = 'Ubuntu Freight'`)).rows[0].name);
    if (!/Sipho/.test(owner)) {
      const r2 = app('rep', <MorphRecord report="deals-by-stage" id={id} />);
      expect(await screen.findByText(/isn't in the report for you any more/)).toBeTruthy();
      r2.unmount();
    }
  });
});
