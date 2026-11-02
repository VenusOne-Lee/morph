-- fixtures/messy: no foreign keys, text statuses in mixed case, a table with
-- RLS off, a table with RLS on but no policies, and a table with no primary key.
create table public.customers (
  id serial primary key,
  name text,
  email_address text,
  cell text,
  dob date
);

create table public.orders (
  id serial primary key,
  customer_id integer,
  status text,
  total numeric,
  created timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.legacy_export (
  id serial primary key,
  payload jsonb,
  salary numeric
);

create table public.audit_trail (
  id serial primary key,
  message text
);

create table public.notes (
  body text,
  order_id integer
);

alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.audit_trail enable row level security;
alter table public.notes enable row level security;
-- legacy_export: RLS off.

create policy customers_all on public.customers for select to authenticated using (true);
create policy orders_all on public.orders for select to authenticated using (true);
create policy notes_all on public.notes for select to authenticated using (true);
