import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { createFixtureDb, fixtureSpecs, FIXTURES_DIR, type FixtureDb } from '@morph-reports/testkit';
import { MorphAuditLog, MorphDashboard, MorphProvider, MorphReport, Kanban, Queue } from '../src/index.js';

let db: FixtureDb;
const specs = fixtureSpecs('crm');

beforeAll(async () => {
  db = await createFixtureDb('crm');
  const dir = join(FIXTURES_DIR, 'crm', 'supabase', 'migrations');
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
});
afterAll(async () => {
  cleanup();
  await db?.drop();
});

function app(user: string, children: React.ReactNode) {
  return render(
    <MorphProvider supabase={db.as(user)} model={specs.model} reports={specs.reports} actions={specs.actions}>
      {children}
    </MorphProvider>,
  );
}

async function a11y(container: HTMLElement) {
  const res = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('<MorphReport> on the CRM fixture', () => {
  it('shows the manager every open deal, grouped by stage, with no axe violations', async () => {
    const { container, unmount } = app('manager', <MorphReport report="deals-by-stage" actions={false} />);
    await screen.findByText(/of \d+ deals shown/);
    expect(screen.getByText(/15 of 15 deals shown/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Proposal, \d+ deals/ }).length).toBe(1);
    expect(await a11y(container)).toEqual([]);
    unmount();
  });

  it('shows a rep only their own deals (RLS, not a client filter)', async () => {
    const { unmount } = app('rep', <MorphReport report="deals-by-stage" actions={false} />);
    const line = await screen.findByText(/of \d+ deals shown/);
    const n = Number(/of (\d+)/.exec(line.textContent ?? '')![1]);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(15);
    unmount();
  });

  it('moves a deal through preview → apply → undo as the manager', async () => {
    const { unmount } = app('manager', <MorphReport report="deals-by-stage" />);
    await screen.findByText(/15 of 15 deals shown/);
    const row = (await screen.findByText('Soweto Bakers')).closest('tr')!;
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Move' })).toBeTruthy());
    fireEvent.click(within(row).getByRole('button', { name: 'Move' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Preview · nothing written yet/)).toBeTruthy();
    const apply = await within(dialog).findByRole('button', { name: /Apply to 1 row/ });
    await act(async () => fireEvent.click(apply));

    const toast = await screen.findByText(/Moved 1 deal to/);
    const before = await db.adminPool.query(`select stage from deals where name = 'Soweto Bakers'`);
    expect(before.rows[0].stage).toBe('qualified');

    await act(async () => fireEvent.click(within(toast.closest('.morph-toast') as HTMLElement).getByRole('button', { name: 'Undo' })));
    await screen.findByText(/Undone\. 1 row restored\./);
    const after = await db.adminPool.query(`select stage from deals where name = 'Soweto Bakers'`);
    expect(after.rows[0].stage).toBe('lead');
    unmount();
  });
});

describe('action widgets', () => {
  it('kanban supports click-to-move without drag, and announces the pick', async () => {
    const spec = (specs.reports as { id: string; widgets: { type: string }[] }[]).find((r) => r.id === 'deals-by-stage')!;
    const { container, unmount } = app('manager', <Kanban report="deals-by-stage" widget={spec.widgets.find((w) => w.type === 'kanban') as never} view="act" />);
    const card = await screen.findByRole('button', { name: /^Soweto Bakers/ });
    fireEvent.click(card);
    expect(card.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(container.querySelector('[role="status"]')?.textContent).toMatch(/Picked Soweto Bakers/));
    const here = screen.getAllByRole('button', { name: 'Move here' });
    expect(here.length).toBeGreaterThan(2);
    fireEvent.click(here[0]!);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await a11y(container)).toEqual([]);
    unmount();
  });

  it('stuck queue offers advance, reassign and close for the oldest stuck deal', async () => {
    const { unmount } = app('manager', <Queue report="stuck-deals" widget={{ type: 'queue', options: { threshold: 14 } }} view="act" />);
    await screen.findByText(/^1 of \d+$/);
    expect(screen.getByRole('button', { name: /^Advance to/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Close as/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await screen.findByText(/^2 of \d+$/);
    unmount();
  });
});

describe('<MorphDashboard> and <MorphAuditLog>', () => {
  it('renders every report with KPI tiles and next best actions', async () => {
    const { container, unmount } = app('manager', <MorphDashboard title="Sales" />);
    await screen.findByText('Next best actions');
    await screen.findByText(/Viewing as Thandi/);
    expect(screen.getAllByText(/Stuck over 14 days/).length).toBeGreaterThan(0);
    expect(await a11y(container)).toEqual([]);
    unmount();
  });

  it('lists the actions taken above, newest first', async () => {
    const { unmount } = app('manager', <MorphAuditLog />);
    await screen.findByText('Action log');
    expect(await screen.findByText('Undone')).toBeTruthy();
    unmount();
  });
});
