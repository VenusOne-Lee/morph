insert into auth.users (id, email) values ('00000000-0000-4000-8003-000000000001', 'm@example.com');
insert into public.customers (name, email_address, cell, dob)
select 'Customer ' || g, 'c' || g || '@example.com', '082 555 ' || lpad(g::text, 4, '0'), date '1980-01-01' + g * 200 from generate_series(1, 10) g;
insert into public.orders (customer_id, status, total, created)
select 1 + g % 10, (array['Open', 'open', 'SHIPPED', 'shipped', 'Cancelled', 'delivered'])[1 + g % 6], 100 + g * 17, now() - make_interval(days => g * 4)
from generate_series(1, 30) g;
insert into public.legacy_export (payload, salary) values ('{"a":1}', 50000);
insert into public.notes (body, order_id) select 'note ' || g, g from generate_series(1, 5) g;
