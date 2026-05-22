-- ==========================================
-- MIGRATION: 20260522000000_fix_list_all_products_rls.sql
-- Description: Modifies list_all_products RPC to return TABLE instead of SETOF public.products.
-- This bypasses RLS policies on the returned recordset for authenticated users.
-- ==========================================

-- 1. Drop existing function (with SETOF return type)
DROP FUNCTION IF EXISTS public.list_all_products(BOOLEAN);

-- 2. Recreate function returning TABLE to bypass RLS select checks on the return rows
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
    has_variants boolean
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
            p.updated_at, p.brand, p.deleted_at, p.has_variants 
        FROM public.products p 
        ORDER BY p.deleted_at NULLS FIRST, p.name ASC;
    ELSE
        RETURN QUERY 
        SELECT 
            p.id, p.code, p.name, p.category, p.description, 
            p.price, p.cost, p.points, p.image_url, p.created_at, 
            p.updated_at, p.brand, p.deleted_at, p.has_variants 
        FROM public.products p 
        WHERE p.deleted_at IS NULL 
        ORDER BY p.name ASC;
    END IF;
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.list_all_products(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_all_products(BOOLEAN) TO anon;
