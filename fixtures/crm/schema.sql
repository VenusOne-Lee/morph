-- fixtures/crm: the sales CRM from the Morph v0.1 prototype.
-- 7 tables. invoices has RLS off (Morph must block it); activities has RLS
-- on with no policies (nothing visible, Morph warns).

create type public.deal_stage as enum ('lead', 'qualified', 'proposal', 'won', 'lost');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.users (
  id uuid primary key references auth.users (id),
  team_id uuid references public.teams (id),
  name text not null,
  email text not null,
  role text not null check (role in ('rep', 'sales_manager')),
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  city text,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  full_name text not null,
  email text,
  phone text,
  id_number text,
  created_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  name text not null,
  company_id uuid references public.companies (id),
  owner_id uuid not null references public.users (id),
  stage public.deal_stage not null default 'lead',
  value_zar numeric(12, 2) not null default 0,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index deals_owner_idx on public.deals (owner_id);
create index deals_stage_idx on public.deals (stage);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  user_id uuid not null references public.users (id),
  kind text not null,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  amount_zar numeric(12, 2) not null,
  status text not null default 'draft',
  issued_at timestamptz not null default now()
);

-- Helper used by policies. security definer so policies can read roles.
create or replace function public.is_sales_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'sales_manager')
$$;

alter table public.teams enable row level security;
alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
-- invoices: RLS deliberately left off.

create policy teams_read on public.teams for select to authenticated using (true);
create policy users_team_read on public.users for select to authenticated using (true);
create policy companies_read on public.companies for select to authenticated using (true);
create policy contacts_read on public.contacts for select to authenticated using (true);

-- Reps see and change their own deals; sales managers see and change all.
create policy deals_team_select on public.deals for select to authenticated
  using (owner_id = auth.uid() or public.is_sales_manager());
create policy deals_team_update on public.deals for update to authenticated
  using (owner_id = auth.uid() or public.is_sales_manager())
  with check (owner_id = auth.uid() or public.is_sales_manager());
