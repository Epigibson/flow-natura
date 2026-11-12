-- ==========================================
-- MIGRATION: 20261112000000_security_lockdown.sql
-- Description: Security fixes from the lote-1 audit.
--   1. Catalog write RPCs were executable by anon (default PUBLIC EXECUTE) and
--      had no auth check → anyone could soft-delete/restore/update products.
--   2. list_all_products leaked cost + full catalog to anon.
--   3. orders/order_items were mutable through RLS FOR ALL, bypassing the
--      atomic RPCs (status changes without restoring stock, totals edits).
-- ==========================================

-- ------------------------------------------
-- 1. Catalog write RPCs: require auth + explicit grants
-- ------------------------------------------

-- restore_product (from 20260326000002)
CREATE OR REPLACE FUNCTION public.restore_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

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

-- soft_delete_product (latest version from 20261002000000, now with auth check)
CREATE OR REPLACE FUNCTION public.soft_delete_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

    IF public.product_used_by_others(p_product_id) THEN
        RAISE EXCEPTION 'Este producto lo usan otras consultoras y no se puede desactivar. Ajusta tu stock a 0 en su lugar.';
    END IF;

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

-- update_product (latest version from 20261002000000, now with auth check)
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
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

    IF public.product_used_by_others(p_product_id) THEN
        RAISE EXCEPTION 'Este producto lo usan otras consultoras y no se puede modificar.';
    END IF;

    UPDATE public.products
    SET name = p_name, code = p_code, brand = p_brand, category = p_category,
        cost = p_cost, price = p_price, points = p_points,
        image_url = p_image_url, description = p_description,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- upsert_product_with_variants (from 20260403000000, now with auth check)
CREATE OR REPLACE FUNCTION public.upsert_product_with_variants(
    p_code TEXT,
    p_name TEXT,
    p_price DECIMAL,
    p_cost DECIMAL DEFAULT 0,
    p_points INTEGER DEFAULT 0,
    p_category TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT 'Natura',
    p_image_url TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_variants JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_product_id UUID;
    v_variant JSONB;
    v_has_variants BOOLEAN;
    v_variant_count INTEGER := 0;
BEGIN
    -- service_role (upload scripts) and postgres run without auth.uid()
    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    v_has_variants := jsonb_array_length(p_variants) > 0;

    INSERT INTO public.products (code, name, price, cost, points, category, brand, image_url, description, has_variants, updated_at)
    VALUES (p_code, p_name, p_price, p_cost, p_points, p_category, p_brand, p_image_url, p_description, v_has_variants, timezone('utc'::text, now()))
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        cost = EXCLUDED.cost,
        points = EXCLUDED.points,
        category = EXCLUDED.category,
        brand = EXCLUDED.brand,
        image_url = COALESCE(EXCLUDED.image_url, public.products.image_url),
        description = COALESCE(EXCLUDED.description, public.products.description),
        has_variants = EXCLUDED.has_variants,
        updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_product_id;

    IF v_has_variants THEN
        FOR v_variant IN SELECT * FROM jsonb_array_elements(p_variants)
        LOOP
            INSERT INTO public.product_variants (
                product_id, code, variant_label, variant_type,
                price, cost, points, image_url, sort_order, updated_at
            )
            VALUES (
                v_product_id,
                v_variant->>'code',
                v_variant->>'label',
                COALESCE(v_variant->>'type', 'tono'),
                (v_variant->>'price')::DECIMAL,
                (v_variant->>'cost')::DECIMAL,
                (v_variant->>'points')::INTEGER,
                v_variant->>'image_url',
                COALESCE((v_variant->>'sort_order')::INTEGER, v_variant_count),
                timezone('utc'::text, now())
            )
            ON CONFLICT (code) DO UPDATE SET
                product_id = EXCLUDED.product_id,
                variant_label = EXCLUDED.variant_label,
                variant_type = EXCLUDED.variant_type,
                price = COALESCE(EXCLUDED.price, public.product_variants.price),
                cost = COALESCE(EXCLUDED.cost, public.product_variants.cost),
                points = COALESCE(EXCLUDED.points, public.product_variants.points),
                image_url = COALESCE(EXCLUDED.image_url, public.product_variants.image_url),
                sort_order = EXCLUDED.sort_order,
                updated_at = timezone('utc'::text, now());

            v_variant_count := v_variant_count + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'product_id', v_product_id,
        'variants_count', v_variant_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_product(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_product(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_product(UUID, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_product_with_variants(TEXT, TEXT, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_product(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_product(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_product(UUID, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_product_with_variants(TEXT, TEXT, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- ------------------------------------------
-- 2. list_all_products: no anon (it exposes cost and the full catalog)
-- ------------------------------------------
REVOKE ALL ON FUNCTION public.list_all_products(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_all_products(BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------
-- 3. orders/order_items: block writes that bypass the atomic RPCs.
--    Clients legitimately UPDATE orders (notes, customer_id) only; anything
--    touching status/total_amount/consultant_id must go through the SECURITY
--    DEFINER RPCs (which run as postgres and are allowed by the trigger).
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_order_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user NOT IN ('postgres', 'service_role') THEN
        IF NEW.status IS DISTINCT FROM OLD.status
           OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
           OR NEW.consultant_id IS DISTINCT FROM OLD.consultant_id THEN
            RAISE EXCEPTION 'Modificación no permitida: usa los RPC de ventas';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_order_columns ON public.orders;
CREATE TRIGGER protect_order_columns
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.protect_order_columns();

DROP POLICY IF EXISTS "Consultants manage items for their orders." ON public.order_items;
CREATE POLICY "Consultants can view their order items."
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND orders.consultant_id = auth.uid()
        )
    );
