-- ==========================================
-- MIGRATION: 20261112000001_data_fixes.sql
-- Description: Data-integrity fixes from the lote-3 audit.
--   1. list_all_products lost variant_count when 20260522000000 recreated it;
--      the admin UI reads it (variant badges never rendered).
--   2. Products SELECT policy hid soft-deleted rows from everyone, so
--      order_items/inventory joins returned NULL and past sales showed "—".
--      Listings filter deleted_at in the app already.
--   3. Missing indexes on columns used by RLS and hot queries.
-- ==========================================

-- ------------------------------------------
-- 1. list_all_products with variant_count restored
-- ------------------------------------------
DROP FUNCTION IF EXISTS public.list_all_products(BOOLEAN);

CREATE OR REPLACE FUNCTION public.list_all_products(
    p_include_deleted BOOLEAN DEFAULT false
)
RETURNS TABLE (
    id uuid,
    code text,
    name text,
    category text,
    description text,
    price numeric,
    cost numeric,
    points integer,
    image_url text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    brand text,
    deleted_at timestamp with time zone,
    has_variants boolean,
    variant_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_include_deleted THEN
        RETURN QUERY
        SELECT
            p.id, p.code, p.name, p.category, p.description,
            p.price, p.cost, p.points, p.image_url, p.created_at,
            p.updated_at, p.brand, p.deleted_at, p.has_variants,
            COUNT(pv.id) AS variant_count
        FROM public.products p
        LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
        GROUP BY p.id
        ORDER BY p.deleted_at NULLS FIRST, p.name ASC;
    ELSE
        RETURN QUERY
        SELECT
            p.id, p.code, p.name, p.category, p.description,
            p.price, p.cost, p.points, p.image_url, p.created_at,
            p.updated_at, p.brand, p.deleted_at, p.has_variants,
            COUNT(pv.id) AS variant_count
        FROM public.products p
        LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY p.id
        ORDER BY p.name ASC;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_all_products(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_all_products(BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------
-- 2. Soft-deleted products stay visible for joins (history); the app and
--    get_public_catalog filter deleted_at themselves.
-- ------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view active products." ON public.products;
CREATE POLICY "Authenticated users can view products."
    ON public.products FOR SELECT
    TO authenticated
    USING (true);

-- ------------------------------------------
-- 3. Missing indexes
-- ------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_consultant_id ON public.orders(consultant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_consultant_id ON public.customers(consultant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_consultant_created ON public.inventory_adjustments(consultant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);
