-- ==========================================
-- MIGRATION: 20260428000000_public_catalog_rpc.sql
-- Description: Creates a public catalog RPC so that shared catalog links
-- work for users who are NOT authenticated or are a different consultant.
-- The RLS on inventory only allows the owner to read, so we need a
-- SECURITY DEFINER function to fetch the public catalog data.
-- ==========================================

-- 1. RPC: Fetch public catalog for a given consultant
-- Returns products with stock > 0, including variant info.
-- Safe because it only exposes: name, price, code, brand, category, image, stock, variants.
-- Does NOT expose cost, consultant_id, or any private data.
CREATE OR REPLACE FUNCTION public.get_public_catalog(p_consultant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Verify consultant exists
    IF NOT EXISTS (SELECT 1 FROM public.consultant_profiles WHERE id = p_consultant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Consultant not found', 'products', '[]'::jsonb);
    END IF;

    SELECT jsonb_build_object(
        'success', true,
        'products', COALESCE(jsonb_agg(product_data ORDER BY product_data->>'name'), '[]'::jsonb)
    )
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'price', p.price,
            'code', p.code,
            'brand', COALESCE(p.brand, ''),
            'category', COALESCE(p.category, ''),
            'image_url', COALESCE(p.image_url, ''),
            'has_variants', COALESCE(p.has_variants, false),
            'stock', SUM(i.quantity),
            'variants', COALESCE(
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', pv.id,
                        'code', pv.code,
                        'label', pv.variant_label,
                        'type', COALESCE(pv.variant_type, 'tono'),
                        'price', COALESCE(pv.price, p.price),
                        'image_url', COALESCE(pv.image_url, '')
                    ) ORDER BY pv.sort_order
                )
                FROM public.product_variants pv
                WHERE pv.product_id = p.id
                  AND pv.deleted_at IS NULL
                ), '[]'::jsonb
            )
        ) AS product_data
        FROM public.inventory i
        JOIN public.products p ON p.id = i.product_id
        WHERE i.consultant_id = p_consultant_id
          AND i.quantity > 0
          AND p.deleted_at IS NULL
        GROUP BY p.id, p.name, p.price, p.code, p.brand, p.category, p.image_url, p.has_variants
    ) sub;

    -- Handle case with no products
    IF v_result IS NULL THEN
        v_result := jsonb_build_object('success', true, 'products', '[]'::jsonb);
    END IF;

    RETURN v_result;
END;
$$;

-- Grant execute to anon role so unauthenticated users can call it
GRANT EXECUTE ON FUNCTION public.get_public_catalog(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(UUID) TO authenticated;
