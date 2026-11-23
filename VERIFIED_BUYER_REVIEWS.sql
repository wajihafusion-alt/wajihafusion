-- Wajiha Fusion: Verified Buyer Product Reviews
-- Run once in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS public.product_reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, order_number text NOT NULL, reviewer_name text NOT NULL, rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5), review text NOT NULL CHECK (char_length(review) BETWEEN 2 AND 1000), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (order_number, product_id));
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read verified product reviews" ON public.product_reviews;
CREATE POLICY "Anyone can read verified product reviews" ON public.product_reviews FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.product_reviews TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_reviews FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.submit_verified_product_review(p_order_number text,p_phone text,p_product_id uuid,p_rating integer,p_review text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_order public.customer_orders%ROWTYPE; v_name text;
BEGIN
 IF p_rating IS NULL OR p_rating<1 OR p_rating>5 THEN RAISE EXCEPTION '১ থেকে ৫ স্টারের মধ্যে রেটিং দিন।'; END IF;
 IF p_review IS NULL OR char_length(trim(p_review))<2 OR char_length(trim(p_review))>1000 THEN RAISE EXCEPTION 'কমপক্ষে ২ অক্ষরের রিভিউ লিখুন (সর্বোচ্চ ১০০০ অক্ষর)।'; END IF;
 SELECT * INTO v_order FROM public.customer_orders o WHERE upper(trim(o.order_number))=upper(trim(p_order_number)) AND regexp_replace(coalesce(o.customer_phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order ID অথবা মোবাইল নম্বর সঠিক নয়।'; END IF;
 IF lower(trim(coalesce(v_order.status,'')))<>'delivered' THEN RAISE EXCEPTION 'শুধু Delivered অর্ডারের কাস্টমার রিভিউ দিতে পারবেন।'; END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_order.items,'[]'::jsonb)) AS item WHERE item->>'product_id'=p_product_id::text) THEN RAISE EXCEPTION 'এই পণ্যটি আপনার অর্ডারে পাওয়া যায়নি।'; END IF;
 v_name:=coalesce(nullif(trim(v_order.customer_name),''),'Verified Buyer');
 INSERT INTO public.product_reviews(product_id,order_number,reviewer_name,rating,review) VALUES(p_product_id,upper(trim(p_order_number)),v_name,p_rating,trim(p_review));
 RETURN jsonb_build_object('success',true,'message','আপনার Verified Review জমা হয়েছে। ধন্যবাদ!');
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'এই অর্ডার থেকে এই পণ্যে আগে একটি রিভিউ দেওয়া হয়েছে।';
END; $$;
REVOKE ALL ON FUNCTION public.submit_verified_product_review(text,text,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_verified_product_review(text,text,uuid,integer,text) TO anon,authenticated;