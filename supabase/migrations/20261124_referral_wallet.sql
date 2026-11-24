-- Wajiha Fusion Referral + Wallet migration
-- Run this file once in Supabase SQL Editor.

create table if not exists public.customer_referral_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_referrals (
  id bigint generated always as identity primary key,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending','rewarded','ineligible')),
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint customer_referrals_not_self check (referred_user_id <> referrer_user_id)
);

create table if not exists public.customer_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_wallet_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null,
  transaction_type text not null check (transaction_type in ('referral_bonus','order_spend')),
  reference text not null,
  description text not null,
  created_at timestamptz not null default now(),
  unique(user_id, transaction_type, reference)
);

alter table public.customer_orders
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists wallet_used numeric(12,2) not null default 0;

create index if not exists customer_orders_user_status_idx
  on public.customer_orders(user_id, status);

create or replace function public.wf_create_customer_rewards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  v_code := 'WF' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  insert into public.customer_referral_profiles(user_id, referral_code)
  values (new.id, v_code)
  on conflict (user_id) do nothing;

  insert into public.customer_wallets(user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists wf_auth_user_rewards on auth.users;
create trigger wf_auth_user_rewards
after insert on auth.users
for each row execute function public.wf_create_customer_rewards();

-- Backfill accounts that already exist.
insert into public.customer_referral_profiles(user_id, referral_code)
select id, 'WF' || upper(substr(replace(id::text, '-', ''), 1, 8))
from auth.users
on conflict (user_id) do nothing;

insert into public.customer_wallets(user_id, balance)
select id, 0 from auth.users
on conflict (user_id) do nothing;

create or replace function public.wf_apply_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_referrer uuid;
begin
  if v_user is null then
    raise exception 'Referral ব্যবহার করতে আগে লগইন করুন।';
  end if;
  if exists(select 1 from public.customer_referrals where referred_user_id = v_user) then
    raise exception 'এই অ্যাকাউন্টে ইতিমধ্যে Referral Code ব্যবহার করা হয়েছে।';
  end if;
  if exists(select 1 from public.customer_orders where user_id = v_user and lower(coalesce(status,'')) = 'delivered') then
    raise exception 'আগে অর্ডার সম্পন্ন হয়েছে, তাই Referral Code ব্যবহার করা যাবে না।';
  end if;

  select user_id into v_referrer
  from public.customer_referral_profiles
  where upper(referral_code) = upper(trim(p_code));

  if v_referrer is null then
    raise exception 'Referral Code সঠিক নয়।';
  end if;
  if v_referrer = v_user then
    raise exception 'নিজের Referral Code ব্যবহার করা যাবে না।';
  end if;

  insert into public.customer_referrals(referred_user_id, referrer_user_id, referral_code)
  values (v_user, v_referrer, upper(trim(p_code)));

  return jsonb_build_object('success', true, 'message', 'Referral Code যুক্ত হয়েছে। প্রথম অর্ডার Delivered হলে দুজনেই ৳৫০ পাবেন।');
end;
$$;

create or replace function public.wf_prepare_customer_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(12,2);
begin
  if new.user_id is not null and new.wallet_used > 0 then
    select balance into v_balance
    from public.customer_wallets
    where user_id = new.user_id
    for update;

    if v_balance is null or new.wallet_used > v_balance then
      raise exception 'Wallet balance যথেষ্ট নয়।';
    end if;
    if new.wallet_used > coalesce(new.subtotal,0) then
      raise exception 'Wallet ব্যবহার অর্ডারের পণ্যমূল্যের বেশি হতে পারবে না।';
    end if;

    update public.customer_wallets
      set balance = balance - new.wallet_used, updated_at = now()
      where user_id = new.user_id;

    insert into public.customer_wallet_transactions(user_id, amount, transaction_type, reference, description)
    values (new.user_id, -new.wallet_used, 'order_spend', coalesce(new.order_number, gen_random_uuid()::text), 'পরবর্তী অর্ডারে Wallet ব্যবহার');
  elsif new.wallet_used > 0 then
    raise exception 'Wallet ব্যবহার করতে অ্যাকাউন্টে লগইন করুন।';
  end if;
  return new;
end;
$$;

drop trigger if exists wf_customer_order_wallet on public.customer_orders;
create trigger wf_customer_order_wallet
before insert on public.customer_orders
for each row execute function public.wf_prepare_customer_order();

create or replace function public.wf_reward_delivered_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referral public.customer_referrals%rowtype;
  v_delivered_count integer;
  v_order_ref text;
begin
  if lower(coalesce(new.status,'')) <> 'delivered'
     or lower(coalesce(old.status,'')) = 'delivered'
     or new.user_id is null then
    return new;
  end if;

  select * into v_referral
  from public.customer_referrals
  where referred_user_id = new.user_id and status = 'pending'
  for update;

  if not found then
    return new;
  end if;

  select count(*) into v_delivered_count
  from public.customer_orders
  where user_id = new.user_id and lower(coalesce(status,'')) = 'delivered';

  if v_delivered_count <> 1 then
    update public.customer_referrals set status = 'ineligible'
    where id = v_referral.id;
    return new;
  end if;

  v_order_ref := coalesce(new.order_number, new.id::text);

  insert into public.customer_wallets(user_id, balance)
  values (v_referral.referrer_user_id, 0)
  on conflict (user_id) do nothing;
  insert into public.customer_wallets(user_id, balance)
  values (v_referral.referred_user_id, 0)
  on conflict (user_id) do nothing;

  update public.customer_wallets
    set balance = balance + 50, updated_at = now()
    where user_id in (v_referral.referrer_user_id, v_referral.referred_user_id);

  insert into public.customer_wallet_transactions(user_id, amount, transaction_type, reference, description)
  values
    (v_referral.referrer_user_id, 50, 'referral_bonus', 'REF-' || v_referral.id::text, 'বন্ধুর প্রথম Delivered Order Referral Bonus'),
    (v_referral.referred_user_id, 50, 'referral_bonus', 'REF-' || v_referral.id::text, 'প্রথম Delivered Order Referral Bonus')
  on conflict (user_id, transaction_type, reference) do nothing;

  update public.customer_referrals
    set status = 'rewarded', rewarded_at = now()
    where id = v_referral.id;

  return new;
end;
$$;

drop trigger if exists wf_delivered_referral_reward on public.customer_orders;
create trigger wf_delivered_referral_reward
after update of status on public.customer_orders
for each row execute function public.wf_reward_delivered_referral();

create or replace function public.wf_my_referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_balance numeric(12,2);
  v_used boolean;
begin
  if v_user is null then raise exception 'লগইন প্রয়োজন।'; end if;
  select referral_code into v_code from public.customer_referral_profiles where user_id = v_user;
  select balance into v_balance from public.customer_wallets where user_id = v_user;
  select exists(select 1 from public.customer_referrals where referred_user_id = v_user) into v_used;
  return jsonb_build_object(
    'referral_code', v_code,
    'wallet_balance', coalesce(v_balance,0),
    'referral_code_used', coalesce(v_used,false)
  );
end;
$$;

create or replace function public.wf_admin_referral_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required';
  end if;
  return jsonb_build_object(
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'referral_code', r.referral_code,
        'referrer_phone', u1.phone,
        'referred_phone', u2.phone,
        'status', r.status,
        'created_at', r.created_at,
        'rewarded_at', r.rewarded_at
      ) order by r.created_at desc)
      from public.customer_referrals r
      left join auth.users u1 on u1.id = r.referrer_user_id
      left join auth.users u2 on u2.id = r.referred_user_id
    ), '[]'::jsonb),
    'wallets', coalesce((
      select jsonb_agg(jsonb_build_object('phone', u.phone, 'balance', w.balance) order by w.balance desc)
      from public.customer_wallets w join auth.users u on u.id = w.user_id
      where w.balance > 0
    ), '[]'::jsonb)
  );
end;
$$;

alter table public.customer_referral_profiles enable row level security;
alter table public.customer_referrals enable row level security;
alter table public.customer_wallets enable row level security;
alter table public.customer_wallet_transactions enable row level security;

drop policy if exists wf_read_own_referral_profile on public.customer_referral_profiles;
create policy wf_read_own_referral_profile on public.customer_referral_profiles
for select to authenticated using (user_id = auth.uid());

drop policy if exists wf_read_own_wallet on public.customer_wallets;
create policy wf_read_own_wallet on public.customer_wallets
for select to authenticated using (user_id = auth.uid());

drop policy if exists wf_read_own_wallet_transactions on public.customer_wallet_transactions;
create policy wf_read_own_wallet_transactions on public.customer_wallet_transactions
for select to authenticated using (user_id = auth.uid());

revoke all on function public.wf_apply_referral_code(text) from public;
revoke all on function public.wf_my_referral_summary() from public;
revoke all on function public.wf_admin_referral_overview() from public;
grant execute on function public.wf_apply_referral_code(text) to authenticated;
grant execute on function public.wf_my_referral_summary() to authenticated;
grant execute on function public.wf_admin_referral_overview() to authenticated;
