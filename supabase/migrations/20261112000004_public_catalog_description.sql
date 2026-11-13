-- ==========================================
-- MIGRATION: 20261112000004_public_catalog_description.sql
-- Description: product detail view for the public catalog needs the
-- description; get_public_catalog did not expose it (safe: it is marketing
-- copy of the shared catalog, same exposure level as name/price/image).
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_public_catalog(p_consultant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
BEGIN
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
            'price', COALESCE(MIN(i.price), p.price),
            'code', p.code,
            'brand', COALESCE(p.brand, ''),
            'category', COALESCE(p.category, ''),
            'description', COALESCE(p.description, ''),
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
                  AND (
                    EXISTS (SELECT 1 FROM public.inventory ib
                            WHERE ib.consultant_id = p_consultant_id AND ib.product_id = p.id
                              AND ib.variant_id IS NULL AND ib.quantity > 0)
                    OR EXISTS (SELECT 1 FROM public.inventory iv
                               WHERE iv.consultant_id = p_consultant_id AND iv.product_id = p.id
                                 AND iv.variant_id = pv.id AND iv.quantity > 0)
                  )
                ), '[]'::jsonb)
        ) AS product_data
        FROM public.inventory i
        JOIN public.products p ON p.id = i.product_id
        WHERE i.consultant_id = p_consultant_id
          AND i.quantity > 0
          AND p.deleted_at IS NULL
        GROUP BY p.id, p.name, p.price, p.code, p.brand, p.category, p.description, p.image_url, p.has_variants
    ) sub;

    IF v_result IS NULL THEN
        v_result := jsonb_build_object('success', true, 'products', '[]'::jsonb);
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalog(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(UUID) TO anon, authenticated, service_role;
