-- WAJIHA FUSION fresh storefront setup
-- Run in Supabase SQL Editor for the existing project.
-- Uses the existing public.products, public.categories, public.admin_users and public.is_admin().

-- Product fields used by this website (stock is deliberately not used in the UI).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS colors jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Category-specific size lists; existing category hierarchy is preserved.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- A separate single-row settings table avoids changing any legacy site_settings structure.
CREATE TABLE IF NOT EXISTS public.storefront_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  banner_text text NOT NULL DEFAULT '',
  banner_enabled boolean NOT NULL DEFAULT false,
  banner_image_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.storefront_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.storefront_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read storefront settings" ON public.storefront_settings;
CREATE POLICY "Public can read storefront settings" ON public.storefront_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage storefront settings" ON public.storefront_settings;
CREATE POLICY "Admins manage storefront settings" ON public.storefront_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Admin product and category management.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read active categories" ON public.categories;
CREATE POLICY "Public can read active categories" ON public.categories FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Ensure public visitors can read active products (keep any existing policies too).
DROP POLICY IF EXISTS "Wajiha public active products" ON public.products;
CREATE POLICY "Wajiha public active products" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true);

-- Product image bucket is public for storefront display; uploads are restricted to admins.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];
DROP POLICY IF EXISTS "Wajiha public image view" ON storage.objects;
CREATE POLICY "Wajiha public image view" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');
DROP POLICY IF EXISTS "Wajiha admin image upload" ON storage.objects;
CREATE POLICY "Wajiha admin image upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
DROP POLICY IF EXISTS "Wajiha admin image update" ON storage.objects;
CREATE POLICY "Wajiha admin image update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND public.is_admin()) WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
DROP POLICY IF EXISTS "Wajiha admin image delete" ON storage.objects;
CREATE POLICY "Wajiha admin image delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND public.is_admin());

NOTIFY pgrst, 'reload schema';
