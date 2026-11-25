-- Wajiha Fusion: update Lucky Wheel prize amounts and probability distribution
alter table public.customer_lucky_spins
  drop constraint if exists customer_lucky_spins_prize_amount_check;
alter table public.customer_lucky_spins
  add constraint customer_lucky_spins_prize_amount_check
  check (prize_amount in (0,10,15,20,25,30,40,50,70));

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
  order by created_at desc limit 1 for update;

  if not found then
    v_roll := random() * 100;
    -- ৳১০=১২%, ৳১৫=২০%, ৳২০=২৫%, ৳২৫=১৫%, ৳৩০=১২%, ৳৪০=৮%, ৳৫০=৫%, ৳৭০=২%, ৳০=১%.
    v_prize := case
      when v_roll < 12 then 10
      when v_roll < 32 then 15
      when v_roll < 57 then 20
      when v_roll < 72 then 25
      when v_roll < 84 then 30
      when v_roll < 92 then 40
      when v_roll < 97 then 50
      when v_roll < 99 then 70
      else 0
    end;
    insert into public.customer_lucky_spins(user_id, prize_amount)
    values (v_user, v_prize) returning * into v_spin;
  end if;
  return jsonb_build_object('spin_id',v_spin.id,'prize_amount',v_spin.prize_amount,'used',v_spin.used_at is not null);
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
    select * into v_spin from public.customer_lucky_spins
    where id = new.lucky_spin_id and user_id = new.user_id for update;
    if not found or v_spin.used_at is not null then
      raise exception 'এই Lucky Wheel Spin আর ব্যবহার করা যাবে না। আবার Spin করুন।';
    end if;
    v_wheel_discount := v_spin.prize_amount;
  elsif coalesce(new.lucky_wheel_discount,0) > 0 then
    raise exception 'Lucky Wheel Spin যাচাই করা যায়নি।';
  end if;
  if v_wheel_discount > 70 then
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
  new.total := greatest(0,coalesce(new.subtotal,0)+coalesce(new.delivery_charge,0)-coalesce(new.discount,0)-coalesce(new.wallet_used,0));
  if new.lucky_spin_id is not null then
    update public.customer_lucky_spins set used_at=now(),order_id=new.id
    where id=new.lucky_spin_id and used_at is null;
  end if;
  return new;
end;
$$;
