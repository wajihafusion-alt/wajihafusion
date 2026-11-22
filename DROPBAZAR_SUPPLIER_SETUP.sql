-- DropBazarBD supplier integration for Wajiha Fusion
-- Run once in Supabase SQL Editor before importing supplier products or receiving supplier webhooks.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_source text,
  ADD COLUMN IF NOT EXISTS supplier_product_id bigint,
  ADD COLUMN IF NOT EXISTS supplier_group_id bigint,
  ADD COLUMN IF NOT EXISTS supplier_cost_price integer,
  ADD COLUMN IF NOT EXISTS supplier_suggested_price integer,
  ADD COLUMN IF NOT EXISTS supplier_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS products_supplier_product_unique
  ON public.products (supplier_source, supplier_product_id)
  WHERE supplier_source IS NOT NULL AND supplier_product_id IS NOT NULL;

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS supplier_order_id bigint,
  ADD COLUMN IF NOT EXISTS supplier_order_number text,
  ADD COLUMN IF NOT EXISTS supplier_status text,
  ADD COLUMN IF NOT EXISTS supplier_order_process text,
  ADD COLUMN IF NOT EXISTS supplier_payment_status text,
  ADD COLUMN IF NOT EXISTS supplier_courier jsonb,
  ADD COLUMN IF NOT EXISTS supplier_last_delivery_id text;

CREATE TABLE IF NOT EXISTS public.dropbazar_webhook_deliveries (
  delivery_id text PRIMARY KEY,
  event text NOT NULL,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dropbazar_webhook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dropbazar_webhook_deliveries FROM anon, authenticated;
