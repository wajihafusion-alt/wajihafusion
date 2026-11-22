-- Wajiha Fusion + Shadamon partner integration
-- Run this once in Supabase SQL Editor after reviewing the columns.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_source text NOT NULL DEFAULT 'own'
    CHECK (product_source IN ('own','shadamon')),
  ADD COLUMN IF NOT EXISTS shadamon_product_id text,
  ADD COLUMN IF NOT EXISTS shadamon_min_price numeric,
  ADD COLUMN IF NOT EXISTS shadamon_available boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS products_shadamon_product_id_unique
  ON public.products (shadamon_product_id)
  WHERE shadamon_product_id IS NOT NULL;

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS shadamon_order_number text,
  ADD COLUMN IF NOT EXISTS shadamon_status text,
  ADD COLUMN IF NOT EXISTS shadamon_submit_error text,
  ADD COLUMN IF NOT EXISTS order_source_summary text NOT NULL DEFAULT 'own';

CREATE INDEX IF NOT EXISTS customer_orders_shadamon_order_number_idx
  ON public.customer_orders (shadamon_order_number)
  WHERE shadamon_order_number IS NOT NULL;

NOTIFY pgrst, 'reload schema';
