-- ==========================================
-- MIGRATION: 20260326000002_soft_delete_products.sql
-- Description: Implements soft delete for products table.
-- Adds deleted_at column, updates RLS policies, and creates
-- RPC functions for soft delete, restore, and admin listing.
-- ==========================================

-- 1. Add soft delete column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Partial index for fast queries on active products
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(id) WHERE deleted_at IS NULL;

-- 3. Update existing SELECT policy to filter out soft-deleted by default
DROP POLICY IF EXISTS "Authenticated users can view products." ON public.products;
CREATE POLICY "Authenticated users can view active products."
    ON public.products FOR SELECT
    TO authenticated
    USING (deleted_at IS NULL);

-- 4. Soft delete RPC function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.soft_delete_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.products
    SET deleted_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found or already deleted';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Restore RPC function
CREATE OR REPLACE FUNCTION public.restore_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.products
    SET deleted_at = NULL,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id AND deleted_at IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found or not deleted';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. List ALL products (including deleted) for admin panel
CREATE OR REPLACE FUNCTION public.list_all_products(
    p_include_deleted BOOLEAN DEFAULT false
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_include_deleted THEN
        RETURN QUERY SELECT * FROM public.products ORDER BY deleted_at NULLS FIRST, name ASC;
    ELSE
        RETURN QUERY SELECT * FROM public.products WHERE deleted_at IS NULL ORDER BY name ASC;
    END IF;
END;
$$;

-- 7. Update product RPC (for admin editing, bypasses RLS)
CREATE OR REPLACE FUNCTION public.update_product(
    p_product_id UUID,
    p_name TEXT,
    p_code TEXT,
    p_brand TEXT,
    p_category TEXT,
    p_cost DECIMAL,
    p_price DECIMAL,
    p_points INTEGER DEFAULT 0,
    p_image_url TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.products
    SET name = p_name,
        code = p_code,
        brand = p_brand,
        category = p_category,
        cost = p_cost,
        price = p_price,
        points = p_points,
        image_url = p_image_url,
        description = p_description,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;
