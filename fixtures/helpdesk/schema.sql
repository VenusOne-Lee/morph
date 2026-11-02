-- fixtures/helpdesk: tickets with a status enum and an assignee.
-- No stage timestamp: Morph falls back to updated_at, labelled approximate.
create type public.ticket_status as enum ('new', 'open', 'pending', 'solved', 'closed');

create table public.agents (
  id uuid primary key references auth.users (id),
  display_name text not null,
  email text not null,
  is_lead boolean not null default false
);

create table public.customers (
  id bigint generated always as identity primary key,
  company_name text not null,
  contact_email text,
  mobile text,
  plan text not null default 'basic',
  created_at timestamptz not null default now()
);

create table public.tickets (
  id bigint generated always as identity primary key,
  subject text not null,
  customer_id bigint not null references public.customers (id),
  assignee_id uuid references public.agents (id),
  status public.ticket_status not null default 'new',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_lead() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agents where id = auth.uid() and is_lead)
$$;

alter table public.agents enable row level security;
alter table public.customers enable row level security;
alter table public.tickets enable row level security;

create policy agents_read on public.agents for select to authenticated using (true);
create policy customers_read on public.customers for select to authenticated using (true);
create policy tickets_select on public.tickets for select to authenticated using (assignee_id = auth.uid() or public.is_lead());
create policy tickets_update on public.tickets for update to authenticated using (assignee_id = auth.uid() or public.is_lead()) with check (true);
