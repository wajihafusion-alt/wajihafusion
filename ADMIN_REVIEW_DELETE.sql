-- Wajiha Fusion: Allow authorized admins to delete customer product reviews
-- Run once in Supabase SQL Editor.
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can delete product reviews" ON public.product_reviews;

CREATE POLICY "Admins can delete product reviews"
ON public.product_reviews
FOR DELETE
TO authenticated
USING (public.is_admin());
