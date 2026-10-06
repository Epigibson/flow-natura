-- ==========================================
-- MIGRATION: 20261006000000_consultant_pricing.sql
-- Description: Per-consultant price/cost on top of the shared catalog.
--   * inventory.price / inventory.cost: optional overrides (NULL = catalog value).
--   * update_my_product: saves my price/cost always; shared catalog fields only
--     when no other consultant uses the product.
--   * remove_from_my_inventory: "eliminar" for a consultant = stop carrying it
--     (catalog and sales history untouched).
--   * get_public_catalog shows the consultant's own price.
-- ==========================================

ALTER TABLE public.inventory
    ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) CHECK (price IS NULL OR price >= 0),
    ADD COLUMN IF NOT EXISTS cost DECIMAL(10, 2) CHECK (cost IS NULL OR cost >= 0);

-- ------------------------------------------
-- update_my_product
-- p_catalog: { name, code, brand, category, points, image_url, description } (all optional)
-- Returns { catalog_updated: bool, catalog_blocked: bool }
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_product(
    p_product_id UUID,
    p_price NUMERIC,
    p_cost NUMERIC,
    p_catalog JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_product public.products%ROWTYPE;
    v_inventory_id UUID;
    v_changed BOOLEAN;
    v_blocked BOOLEAN := false;
    v_updated BOOLEAN := false;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
    IF p_price IS NOT NULL AND p_price < 0 THEN RAISE EXCEPTION 'El precio no puede ser negativo'; END IF;
    IF p_cost IS NOT NULL AND p_cost < 0 THEN RAISE EXCEPTION 'El costo no puede ser negativo'; END IF;

    SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

    -- 1. My price/cost (create a 0-stock row if I don't carry it yet)
    SELECT id INTO v_inventory_id FROM public.inventory
    WHERE consultant_id = v_uid AND product_id = p_product_id
    ORDER BY created_at LIMIT 1
    FOR UPDATE;

    IF v_inventory_id IS NULL THEN
        INSERT INTO public.inventory (consultant_id, product_id, quantity, price, cost)
        VALUES (v_uid, p_product_id, 0, round(p_price, 2), round(p_cost, 2));
    ELSE
        UPDATE public.inventory
        SET price = round(p_price, 2), cost = round(p_cost, 2),
            updated_at = timezone('utc'::text, now())
        WHERE id = v_inventory_id;
    END IF;

    -- 2. Shared catalog fields, only if something actually changed
    p_catalog := coalesce(p_catalog, '{}'::jsonb);
    v_changed :=
        (p_catalog ? 'name' AND p_catalog->>'name' IS DISTINCT FROM v_product.name) OR
        (p_catalog ? 'code' AND p_catalog->>'code' IS DISTINCT FROM v_product.code) OR
        (p_catalog ? 'brand' AND nullif(p_catalog->>'brand', '') IS DISTINCT FROM v_product.brand) OR
        (p_catalog ? 'category' AND nullif(p_catalog->>'category', '') IS DISTINCT FROM v_product.category) OR
        (p_catalog ? 'points' AND (p_catalog->>'points')::integer IS DISTINCT FROM v_product.points) OR
        (p_catalog ? 'image_url' AND nullif(p_catalog->>'image_url', '') IS DISTINCT FROM v_product.image_url) OR
        (p_catalog ? 'description' AND nullif(p_catalog->>'description', '') IS DISTINCT FROM v_product.description);

    IF v_changed THEN
        IF public.product_used_by_others(p_product_id) THEN
            v_blocked := true;
        ELSE
            IF p_catalog ? 'name' AND nullif(trim(p_catalog->>'name'), '') IS NULL THEN
                RAISE EXCEPTION 'El nombre es obligatorio';
            END IF;
            IF p_catalog ? 'code' AND nullif(trim(p_catalog->>'code'), '') IS NULL THEN
                RAISE EXCEPTION 'El código es obligatorio';
            END IF;
            UPDATE public.products SET
                name = CASE WHEN p_catalog ? 'name' THEN trim(p_catalog->>'name') ELSE name END,
                code = CASE WHEN p_catalog ? 'code' THEN trim(p_catalog->>'code') ELSE code END,
                brand = CASE WHEN p_catalog ? 'brand' THEN nullif(p_catalog->>'brand', '') ELSE brand END,
                category = CASE WHEN p_catalog ? 'category' THEN nullif(p_catalog->>'category', '') ELSE category END,
                points = CASE WHEN p_catalog ? 'points' THEN coalesce((p_catalog->>'points')::integer, 0) ELSE points END,
                image_url = CASE WHEN p_catalog ? 'image_url' THEN nullif(p_catalog->>'image_url', '') ELSE image_url END,
                description = CASE WHEN p_catalog ? 'description' THEN nullif(p_catalog->>'description', '') ELSE description END,
                updated_at = timezone('utc'::text, now())
            WHERE id = p_product_id;
            v_updated := true;
        END IF;
    END IF;

    RETURN jsonb_build_object('catalog_updated', v_updated, 'catalog_blocked', v_blocked);
END;
$$;

-- ------------------------------------------
-- remove_from_my_inventory: returns the units that were in stock
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_from_my_inventory(p_product_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_units INTEGER;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

    SELECT coalesce(sum(quantity), 0) INTO v_units FROM public.inventory
    WHERE consultant_id = v_uid AND product_id = p_product_id;

    DELETE FROM public.inventory WHERE consultant_id = v_uid AND product_id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto no está en tu inventario'; END IF;

    RETURN v_units;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_product(UUID, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_from_my_inventory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_product(UUID, NUMERIC, NUMERIC, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_from_my_inventory(UUID) TO authenticated;

-- ------------------------------------------
-- Public catalog: the consultant's own price
-- ------------------------------------------
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
            'price', COALESCE(MAX(i.price), p.price),
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

    IF v_result IS NULL THEN
        v_result := jsonb_build_object('success', true, 'products', '[]'::jsonb);
    END IF;

    RETURN v_result;
END;
$$;
