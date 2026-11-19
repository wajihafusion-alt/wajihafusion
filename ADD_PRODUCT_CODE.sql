-- Wajiha Fusion: Product Code support
-- Run this once in Supabase SQL Editor. Existing products remain unchanged.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_code text;

CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_unique
ON public.products (product_code)
WHERE product_code IS NOT NULL AND product_code <> '';

NOTIFY pgrst, 'reload schema';
