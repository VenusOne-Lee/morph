insert into auth.users (id, email) values
  ('00000000-0000-4000-8001-000000000001', 'naledi@example.co.za'),
  ('00000000-0000-4000-8001-000000000002', 'kabelo@example.co.za'),
  ('00000000-0000-4000-8001-000000000003', 'megan@example.co.za');
insert into public.agents (id, display_name, email, is_lead) values
  ('00000000-0000-4000-8001-000000000001', 'Naledi P.', 'naledi@example.co.za', true),
  ('00000000-0000-4000-8001-000000000002', 'Kabelo S.', 'kabelo@example.co.za', false),
  ('00000000-0000-4000-8001-000000000003', 'Megan J.', 'megan@example.co.za', false);
insert into public.customers (company_name, contact_email, mobile, plan)
select 'Customer ' || g, 'help' || g || '@example.co.za', '+27 71 555 ' || lpad(g::text, 4, '0'), (array['basic', 'pro', 'enterprise'])[1 + g % 3]
from generate_series(1, 12) g;
insert into public.tickets (subject, customer_id, assignee_id, status, priority, created_at, updated_at)
select 'Ticket ' || g, 1 + g % 12,
  (array['00000000-0000-4000-8001-000000000001', '00000000-0000-4000-8001-000000000002', '00000000-0000-4000-8001-000000000003'])[1 + g % 3]::uuid,
  (array['new', 'open', 'pending', 'solved', 'closed'])[1 + g % 5]::public.ticket_status,
  (array['low', 'normal', 'high', 'urgent'])[1 + g % 4],
  now() - make_interval(days => g * 3), now() - make_interval(days => g % 40)
from generate_series(1, 40) g;
