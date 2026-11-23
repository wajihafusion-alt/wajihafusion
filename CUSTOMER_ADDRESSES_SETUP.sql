-- Wajiha Fusion customer saved delivery addresses
-- Run this file in Supabase SQL Editor.

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'home' check (label in ('home','office','other')),
  recipient_name text not null,
  phone text not null,
  delivery_area text not null check (delivery_area in ('ঢাকার ভিতরে','ঢাকার বাইরে')),
  district text not null,
  thana text not null,
  full_address text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_user_id_idx
  on public.customer_addresses(user_id);

create unique index if not exists customer_addresses_one_default_per_user
  on public.customer_addresses(user_id) where is_default = true;

alter table public.customer_addresses enable row level security;

drop policy if exists "Customers can read own addresses" on public.customer_addresses;
create policy "Customers can read own addresses"
  on public.customer_addresses for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Customers can add own addresses" on public.customer_addresses;
create policy "Customers can add own addresses"
  on public.customer_addresses for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Customers can edit own addresses" on public.customer_addresses;
create policy "Customers can edit own addresses"
  on public.customer_addresses for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Customers can delete own addresses" on public.customer_addresses;
create policy "Customers can delete own addresses"
  on public.customer_addresses for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_default_customer_address(address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.customer_addresses
    where id = address_id and user_id = current_user_id
  ) then
    raise exception 'Address not found';
  end if;

  update public.customer_addresses
  set is_default = false, updated_at = now()
  where user_id = current_user_id and is_default = true;

  update public.customer_addresses
  set is_default = true, updated_at = now()
  where id = address_id and user_id = current_user_id;
end;
$$;

revoke all on function public.set_default_customer_address(uuid) from public;
grant execute on function public.set_default_customer_address(uuid) to authenticated;
