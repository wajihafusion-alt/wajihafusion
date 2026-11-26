create table if not exists public.wf_help_faqs(id uuid primary key default gen_random_uuid(),category text not null default 'General',question text not null,answer text not null,keywords text not null default '',enabled boolean not null default true,sort_order integer not null default 100,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.wf_help_faqs enable row level security;
drop policy if exists "Public can read active help FAQs" on public.wf_help_faqs;
create policy "Public can read active help FAQs" on public.wf_help_faqs for select using(enabled=true or public.is_admin());
drop policy if exists "Admins manage help FAQs" on public.wf_help_faqs;
create policy "Admins manage help FAQs" on public.wf_help_faqs for all using(public.is_admin()) with check(public.is_admin());
create index if not exists wf_help_faqs_sort_idx on public.wf_help_faqs(sort_order,created_at);
insert into public.wf_help_faqs(category,question,answer,keywords,sort_order) values
('Account','কীভাবে Account খুলব?','Menu থেকে Account খুলুন। নতুন অ্যাকাউন্ট নির্বাচন করে Email ও কমপক্ষে ৮ অক্ষরের Password দিন। Email Verification সম্পন্ন হলে Login করুন।','signup register email password verification',10),
('Account','Password ভুলে গেলে কী করব?','Login স্ক্রিনে “পাসওয়ার্ড ভুলে গেছেন?” চাপুন। Account-এর Email দিয়ে Reset Link নিন এবং Email-এর লিংক থেকে নতুন Password সেট করুন।','forgot password reset',20),
('Referral','Referral কীভাবে কাজ করে?','আপনার Referral Code বন্ধুকে দিন। বন্ধু সেই Code ব্যবহার করে প্রথম অর্ডার করলে এবং অর্ডারটি Delivered হলে আপনি ও নতুন বন্ধু দুজনেই ৳৫০ করে Bonus পাবেন।','referral refer friend code bonus 50 delivered',30),
('Discount','Discount কীভাবে পাব?','চলমান Offer, Referral Wallet এবং Checkout-এর Mystery Box Reward থেকে প্রযোজ্য Discount পাওয়া যেতে পারে। Checkout-এ প্রদর্শিত হিসাবই চূড়ান্ত।','discount offer coupon',40),
('Mystery Box','Mystery Box কীভাবে কাজ করে?','Checkout-এ Mystery Box খুলে Surprise Discount জিততে পারবেন। পণ্যের অর্ডার কমপক্ষে ৳৫০ হতে হবে এবং Account-এ Login থাকতে হবে। প্রতি অর্ডারে একবার সুযোগ। Mystery Box ও Wallet মিলিয়ে সর্বোচ্চ ৳১০০ Discount।','mystery box gift surprise reward',50),
('Mystery Box','Mystery Box-এ কত Discount পাওয়া যায়?','বর্তমান ওয়েবসাইটের নিয়ম অনুযায়ী Mystery Box-এ ৳০ থেকে ৳৭০ পর্যন্ত Discount পাওয়া যেতে পারে।','mystery prize amount 0 70',60),
('Wallet','Referral Wallet কীভাবে ব্যবহার করব?','Checkout-এ Referral Wallet ব্যবহারের ঘরে পরিমাণ লিখুন। প্রতি অর্ডারে সর্বোচ্চ ৳৫০ ব্যবহার করা যায়। Wallet-এর টাকা Withdraw করা যায় না।','wallet balance use withdraw 50',70),
('Order','কীভাবে অর্ডার করব?','পণ্য নির্বাচন করে Size ও Color বেছে Add to Cart চাপুন। Checkout-এ নাম, মোবাইল নম্বর ও Delivery Address দিয়ে অর্ডার জমা দিন।','order checkout cart buy',80),
('Order','আমার অর্ডার কোথায় দেখব?','Account-এ Login করে Website Menu থেকে My Orders নির্বাচন করুন। সেখানে অর্ডারের Status দেখতে পারবেন।','track order status my orders',90),
('Delivery','Delivery Charge কত?','বর্তমান Checkout অনুযায়ী ঢাকার ভিতরে ৳৮০ এবং ঢাকার বাইরে ৳১২০। Checkout-এ চার্জ নিশ্চিত করে দেখুন।','delivery shipping charge dhaka',100),
('Payment','কীভাবে Payment করব?','বর্তমানে Cash on Delivery (COD) পদ্ধতিতে অর্ডার করা যায়। পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন।','payment cod cash',110),
('Support','আরও সাহায্য লাগলে কী করব?','আরও সাহায্যের জন্য Website-এর Contact on WhatsApp লিংক ব্যবহার করুন।','support help contact whatsapp',120)
on conflict do nothing;
-- Wajiha Fusion FAQ + Customer/Admin conversation
create table if not exists public.wf_help_messages(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null,
 sender text not null check(sender in ('customer','admin')),
 message text not null check(char_length(message) between 1 and 1000),
 created_at timestamptz not null default now()
);
alter table public.wf_help_messages enable row level security;
drop policy if exists "Customers and admins read help messages" on public.wf_help_messages;
create policy "Customers and admins read help messages" on public.wf_help_messages for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "Customers and admins send help messages" on public.wf_help_messages;
create policy "Customers and admins send help messages" on public.wf_help_messages for insert to authenticated with check((sender='customer' and user_id=auth.uid()) or (sender='admin' and public.is_admin()));
create index if not exists wf_help_messages_thread_idx on public.wf_help_messages(thread_id,created_at);
create index if not exists wf_help_messages_user_idx on public.wf_help_messages(user_id,created_at desc);
