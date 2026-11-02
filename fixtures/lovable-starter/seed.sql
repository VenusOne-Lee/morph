insert into auth.users (id, email) values
  ('00000000-0000-4000-8002-000000000001', 'amara@example.com'),
  ('00000000-0000-4000-8002-000000000002', 'ben@example.com'),
  ('00000000-0000-4000-8002-000000000003', 'chloe@example.com'),
  ('00000000-0000-4000-8002-000000000004', 'outsider@example.com');
insert into public.profiles (id, full_name, email) values
  ('00000000-0000-4000-8002-000000000001', 'Amara Obi', 'amara@example.com'),
  ('00000000-0000-4000-8002-000000000002', 'Ben Carter', 'ben@example.com'),
  ('00000000-0000-4000-8002-000000000003', 'Chloe Martin', 'chloe@example.com'),
  ('00000000-0000-4000-8002-000000000004', 'Olu Outsider', 'outsider@example.com');
insert into public.organisations (id, name) values
  ('40000000-0000-4000-8000-000000000001', 'Acme Studio'),
  ('40000000-0000-4000-8000-000000000002', 'Other Org');
insert into public.organisation_members (organisation_id, user_id, role) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8002-000000000001', 'owner'),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8002-000000000002', 'member'),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8002-000000000003', 'member'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000004', 'owner');
insert into public.projects (id, organisation_id, name, status, owner_id, budget, created_at)
select ('50000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  case when g <= 6 then '40000000-0000-4000-8000-000000000001' else '40000000-0000-4000-8000-000000000002' end::uuid,
  'Project ' || g, (array['planning', 'active', 'active', 'on_hold', 'done'])[1 + g % 5],
  case when g <= 6 then ('00000000-0000-4000-8002-00000000000' || (1 + g % 3))::uuid else '00000000-0000-4000-8002-000000000004'::uuid end,
  10000 * g, now() - make_interval(days => g * 20)
from generate_series(1, 8) g;
insert into public.tasks (project_id, title, status, assignee_id, due_date, created_at, status_changed_at)
select ('50000000-0000-4000-8000-' || lpad((1 + g % 8)::text, 12, '0'))::uuid,
  'Task ' || g, (array['todo', 'in_progress', 'review', 'done'])[1 + g % 4],
  case when (1 + g % 8) <= 6 then ('00000000-0000-4000-8002-00000000000' || (1 + g % 3))::uuid else '00000000-0000-4000-8002-000000000004'::uuid end,
  current_date + (g % 20) - 5, now() - make_interval(days => g * 2), now() - make_interval(days => g % 35)
from generate_series(1, 48) g;
