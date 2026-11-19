ALTER TABLE public.storefront_settings
ADD COLUMN IF NOT EXISTS banner_images jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
