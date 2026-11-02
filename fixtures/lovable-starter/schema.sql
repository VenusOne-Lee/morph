-- fixtures/lovable-starter: the shape Lovable typically generates.
-- Text status columns with check constraints, profiles keyed to auth.users,
-- membership-based RLS.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  primary key (organisation_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'on_hold', 'done', 'cancelled')),
  owner_id uuid references public.profiles (id),
  budget numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'done')),
  assignee_id uuid references public.profiles (id),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function public.is_org_member(org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organisation_members where organisation_id = org and user_id = auth.uid())
$$;
create or replace function public.is_org_admin(org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organisation_members where organisation_id = org and user_id = auth.uid() and role in ('owner', 'admin'))
$$;

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;

create policy "Profiles are viewable by members" on public.profiles for select to authenticated using (true);
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid());
create policy "Members view orgs" on public.organisations for select to authenticated using (public.is_org_member(id));
create policy "Members view membership" on public.organisation_members for select to authenticated using (public.is_org_member(organisation_id));
create policy "Members view projects" on public.projects for select to authenticated using (public.is_org_member(organisation_id));
create policy "Admins update projects" on public.projects for update to authenticated using (public.is_org_admin(organisation_id));
create policy "Members view tasks" on public.tasks for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_org_member(p.organisation_id)));
create policy "Members update tasks" on public.tasks for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_org_member(p.organisation_id)));
