WAJIHA FUSION — নতুন ওয়েবসাইট ফাইল

ফাইলগুলো:
- index.html: Customer website
- admin.html: Admin panel
- styles.css / admin.css: Design
- app.js / admin.js: Website functions
- config.js: Supabase public URL/key + WhatsApp
- setup.sql: Supabase setup SQL

গুরুত্বপূর্ণ:
১) এই প্যাকেজে stock UI নেই। Product-এ color, size, একাধিক photo, category, price এবং WhatsApp order আছে।
২) Admin login করতে Supabase Auth-এ থাকা সেই email/password ব্যবহার করতে হবে, যার UUID public.admin_users-এ আছে।
৩) setup.sql Supabase SQL Editor-এ একবার চালাতে হবে।
৪) সব ফাইল একই folder-এ রেখে Netlify-তে deploy করতে হবে।
৫) Admin URL হবে /admin.html
৬) WhatsApp নম্বর config.js-এ 8801624629576 দেওয়া আছে।
৭) config.js-এ কেবল public/publishable key থাকবে। কখনো service_role/secret key বসাবেন না।

নোট: setup.sql ধরে নেয় public.products ও public.categories টেবিল আগে থেকেই আছে, যেমন আগের Supabase project-এ তৈরি করা হয়েছিল।


PRODUCT CODE SEARCH UPDATE:
1) Supabase SQL Editor-এ ADD_PRODUCT_CODE.sql ফাইলের SQL একবার Run করুন।
2) ZIP-এর সব website/admin files আগের মতো Cloudflare Worker-এ upload করুন (পুরোনো ফাইল replace হবে)।
3) Admin Panel > Products-এ Product Code লিখে Save করুন।
4) উপরের search box-এ Product Name অথবা Product Code লিখলে পণ্য খুঁজে পাবেন।
5) WhatsApp order message-এও Product Code যাবে।
পুরোনো product-গুলোর code থাকলে সেগুলো pCode ঘরে edit করে save করুন। প্রতিটি code আলাদা হতে হবে।


AUTO PRODUCT CODE UPDATE:
- Product form-এর Product code আর বাধ্যতামূলক নয়।
- Product code ঘর খালি রেখে নতুন Product Save করলে Supabase trigger স্বয়ংক্রিয়ভাবে WF-001, WF-002 ইত্যাদি তৈরি করবে।
- নিজের Code দিতে চাইলে Product code ঘরে লিখতে পারবেন।
- পুরোনো Product-এর Code ফাঁকা রেখে Edit করলে আগের Code অপরিবর্তিত থাকবে।
- এই ZIP ধরে নেয় Supabase-এ auto_product_code trigger এবং products_product_code_seq আগে থেকেই তৈরি আছে। নতুন করে setup.sql বা অন্য SQL চালাবেন না।
