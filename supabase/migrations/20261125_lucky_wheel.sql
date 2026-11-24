-- Wajiha Fusion Lucky Wheel fixed-amount rewards + cancellation wallet refund
-- Run once in Supabase SQL Editor after the referral wallet migration.

alter table public.customer_orders
  add column if not exists lucky_wheel_discount numeric(12,2) not null default 0,
  add column if not exists lucky_spin_id uuid;

create table if not exists public.customer_lucky_spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prize_amount numeric(12,2) not null check (prize_amount in (0,10,15,20,30,50)),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  order_id uuid references public.customer_orders(id) on delete set null
);

create unique index if not exists customer_lucky_spins_one_unused_per_user
  on public.customer_lucky_spins(user_id) where used_at is null;

alter table public.customer_lucky_spins enable row level security;

create or replace function public.wf_spin_lucky_wheel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_spin public.customer_lucky_spins%rowtype;
  v_roll numeric;
  v_prize numeric(12,2);
begin
  if v_user is null then
    raise exception 'Lucky Wheel ব্যবহার করতে আগে লগইন করুন।';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select * into v_spin
  from public.customer_lucky_spins
  where user_id = v_user and used_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    v_roll := random() * 100;
    -- Probability: ৳৫০=৫%, ৳৩০=৮%, ৳২০=১৫%, ৳১৫=২০%, ৳১০=৩২%, ৳০=২০%.
    v_prize := case
      when v_roll < 5 then 50
      when v_roll < 13 then 30
      when v_roll < 28 then 20
      when v_roll < 48 then 15
      when v_roll < 80 then 10
      else 0
    end;

    insert into public.customer_lucky_spins(user_id, prize_amount)
    values (v_user, v_prize)
    returning * into v_spin;
  end if;

  return jsonb_build_object(
    'spin_id', v_spin.id,
    'prize_amount', v_spin.prize_amount,
    'used', v_spin.used_at is not null
  );
end;
$$;

create or replace function public.wf_prepare_lucky_wheel_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spin public.customer_lucky_spins%rowtype;
  v_wheel_discount numeric(12,2) := 0;
begin
  if coalesce(new.wallet_used,0) > 50 then
    raise exception 'এক অর্ডারে Referral Wallet সর্বোচ্চ ৳৫০ ব্যবহার করা যাবে।';
  end if;

  if new.lucky_spin_id is not null then
    if coalesce(new.subtotal,0) < 50 then
      raise exception 'Lucky Wheel ব্যবহার করতে পণ্যের অর্ডার কমপক্ষে ৳৫০ হতে হবে।';
    end if;
    if new.user_id is null or new.user_id <> auth.uid() then
      raise exception 'Lucky Wheel Discount ব্যবহার করতে নিজের অ্যাকাউন্টে লগইন করুন।';
    end if;

    select * into v_spin
    from public.customer_lucky_spins
    where id = new.lucky_spin_id and user_id = new.user_id
    for update;

    if not found or v_spin.used_at is not null then
      raise exception 'এই Lucky Wheel Spin আর ব্যবহার করা যাবে না। আবার Spin করুন।';
    end if;

    v_wheel_discount := v_spin.prize_amount;
  elsif coalesce(new.lucky_wheel_discount,0) > 0 then
    raise exception 'Lucky Wheel Spin যাচাই করা যায়নি।';
  end if;

  if v_wheel_discount > 50 then
    raise exception 'Lucky Wheel Discount সীমা অতিক্রম করেছে।';
  end if;
  if v_wheel_discount > coalesce(new.subtotal,0) then
    raise exception 'Lucky Wheel Discount ব্যবহার করতে পণ্যের মূল্য অন্তত জেতা Discount-এর সমান হতে হবে।';
  end if;

  new.lucky_wheel_discount := v_wheel_discount;
  new.discount := coalesce(new.discount,0) + v_wheel_discount;
  if new.discount + coalesce(new.wallet_used,0) > 100 then
    raise exception 'এক অর্ডারে মোট Discount সর্বোচ্চ ৳১০০।';
  end if;
  new.total := greatest(0, coalesce(new.subtotal,0) + coalesce(new.delivery_charge,0)
                    - coalesce(new.discount,0) - coalesce(new.wallet_used,0));

  if new.lucky_spin_id is not null then
    update public.customer_lucky_spins
    set used_at = now(), order_id = new.id
    where id = new.lucky_spin_id and used_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists wf_lucky_wheel_order on public.customer_orders;
create trigger wf_lucky_wheel_order
before insert on public.customer_orders
for each row execute function public.wf_prepare_lucky_wheel_order();

-- Return Referral Wallet funds once if an order is cancelled.
alter table public.customer_wallet_transactions
  drop constraint if exists customer_wallet_transactions_transaction_type_check;
alter table public.customer_wallet_transactions
  add constraint customer_wallet_transactions_transaction_type_check
  check (transaction_type in ('referral_bonus','order_spend','order_refund'));

create or replace function public.wf_refund_cancelled_order_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_id bigint;
  v_cancelled boolean;
begin
  v_cancelled := lower(coalesce(new.status,'')) in ('cancelled','canceled','বাতিল','অর্ডার বাতিল');
  if not v_cancelled
     or lower(coalesce(old.status,'')) in ('cancelled','canceled','বাতিল','অর্ডার বাতিল')
     or coalesce(new.wallet_used,0) <= 0
     or new.user_id is null then
    return new;
  end if;

  insert into public.customer_wallet_transactions(user_id, amount, transaction_type, reference, description)
  values (new.user_id, new.wallet_used, 'order_refund',
          coalesce(new.order_number,new.id::text), 'বাতিল অর্ডারের Wallet টাকা ফেরত')
  on conflict (user_id, transaction_type, reference) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    insert into public.customer_wallets(user_id, balance)
    values (new.user_id, new.wallet_used)
    on conflict (user_id) do update
      set balance = public.customer_wallets.balance + excluded.balance,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists wf_cancelled_order_wallet_refund on public.customer_orders;
create trigger wf_cancelled_order_wallet_refund
after update of status on public.customer_orders
for each row execute function public.wf_refund_cancelled_order_wallet();

revoke all on function public.wf_spin_lucky_wheel() from public;
grant execute on function public.wf_spin_lucky_wheel() to authenticated;
