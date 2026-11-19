create table if not exists public.customer_orders (
 id uuid primary key default gen_random_uuid(),
 order_number text not null unique default ('WF-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))),
 customer_name text not null, customer_phone text not null,
 delivery_area text, district text, thana text, address text,
 items jsonb not null default '[]'::jsonb,
 subtotal numeric not null default 0, discount numeric not null default 0,
 delivery_charge numeric not null default 0, total numeric not null default 0,
 payment_method text, transaction_id text,
 status text not null default 'New',
 created_at timestamptz not null default now()
);
alter table public.customer_orders enable row level security;
drop policy if exists "Public can place orders" on public.customer_orders;
create policy "Public can place orders" on public.customer_orders for insert to anon, authenticated with check (true);
drop policy if exists "Admins read and update orders" on public.customer_orders;
create policy "Admins read and update orders" on public.customer_orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant insert on public.customer_orders to anon, authenticated;
grant select, update on public.customer_orders to authenticated;
