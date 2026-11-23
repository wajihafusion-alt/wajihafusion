-- Wajiha Fusion: Admin replies to verified product reviews
-- Run once in Supabase SQL Editor.
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS admin_replied_at timestamptz;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can reply to product reviews" ON public.product_reviews;
CREATE POLICY "Admins can reply to product reviews"
ON public.product_reviews
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT UPDATE (admin_reply, admin_replied_at) ON public.product_reviews TO authenticated;
