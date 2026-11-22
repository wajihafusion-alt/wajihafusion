-- Wajiha Fusion: remove Shadamon supplier integration and imported products.
-- Run this script once in Supabase SQL Editor after reviewing it.
BEGIN;
DELETE FROM public.products
WHERE COALESCE(product_source, '') = 'shadamon'
   OR shadamon_product_id IS NOT NULL
   OR product_code LIKE 'SHD-%';
UPDATE public.customer_orders
SET items = (
  SELECT COALESCE(jsonb_agg(item - 'product_source' - 'shadamon_product_id' - 'supplier_order_ref' - 'supplier_order_status'),'[]'::jsonb)
  FROM jsonb_array_elements(items::jsonb) AS item
)
WHERE jsonb_typeof(items::jsonb) = 'array'
  AND items::jsonb::text ~ '(product_source|shadamon_product_id|supplier_order_ref|supplier_order_status)';
DROP INDEX IF EXISTS public.products_shadamon_product_id_unique;
DROP INDEX IF EXISTS public.customer_orders_shadamon_order_number_idx;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_source_check;
ALTER TABLE public.products
  DROP COLUMN IF EXISTS shadamon_product_id,
  DROP COLUMN IF EXISTS shadamon_min_price,
  DROP COLUMN IF EXISTS shadamon_available,
  DROP COLUMN IF EXISTS product_source;
ALTER TABLE public.customer_orders
  DROP COLUMN IF EXISTS shadamon_order_number,
  DROP COLUMN IF EXISTS shadamon_status,
  DROP COLUMN IF EXISTS shadamon_submit_error,
  DROP COLUMN IF EXISTS order_source_summary;
NOTIFY pgrst, 'reload schema';
COMMIT;
