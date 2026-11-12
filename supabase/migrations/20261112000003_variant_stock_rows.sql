-- ==========================================
-- MIGRATION: 20261112000003_variant_stock_rows.sql
-- Description: sales operate at product level (order_items has no variant_id),
-- but inventory may hold one row per variant. Every RPC that picked a row with
-- "ORDER BY created_at LIMIT 1" hit an arbitrary row: deductions could drain a
-- variant row, cancel_order could restock the wrong row, and price/cost edits
-- could land on a variant row. Selection is now deterministic:
-- base row first (variant_id IS NULL), then oldest.
-- ==========================================

-- ------------------------------------------
-- deduct_inventory_on_sale (trigger on order_items INSERT)
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_inventory_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_consultant_id UUID;
    v_inventory_id UUID;
BEGIN
    SELECT consultant_id INTO v_consultant_id
    FROM public.orders
    WHERE id = NEW.order_id;

    SELECT id INTO v_inventory_id
    FROM public.inventory
    WHERE consultant_id = v_consultant_id
      AND product_id = NEW.product_id
      AND quantity >= NEW.quantity
    ORDER BY (variant_id IS NULL) DESC, created_at
    LIMIT 1
    FOR UPDATE;

    IF v_inventory_id IS NULL THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto o el registro de inventario no existe.';
    END IF;

    UPDATE public.inventory
    SET quantity = quantity - NEW.quantity,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_inventory_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ------------------------------------------
-- cancel_order: restock the same deterministic row
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_status public.order_status;
    v_item RECORD;
    v_inventory_id UUID;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

    SELECT status INTO v_status FROM public.orders
    WHERE id = p_order_id AND consultant_id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
    IF v_status = 'cancelled' THEN RAISE EXCEPTION 'La venta ya estaba cancelada'; END IF;

    FOR v_item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
        SELECT id INTO v_inventory_id FROM public.inventory
        WHERE consultant_id = v_uid AND product_id = v_item.product_id
        ORDER BY (variant_id IS NULL) DESC, created_at LIMIT 1
        FOR UPDATE;

        IF v_inventory_id IS NULL THEN
            INSERT INTO public.inventory (consultant_id, product_id, quantity)
            VALUES (v_uid, v_item.product_id, v_item.quantity);
        ELSE
            UPDATE public.inventory
            SET quantity = quantity + v_item.quantity,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_inventory_id;
        END IF;
    END LOOP;

    UPDATE public.orders SET status = 'cancelled', updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated, service_role;

-- ------------------------------------------
-- apply_inventory_adjustment
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_inventory_adjustment(
    p_consultant_id UUID,
    p_product_id UUID,
    p_adjustment_type TEXT,
    p_quantity INTEGER,
    p_previous_quantity INTEGER,
    p_reason TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_inventory_id UUID;
    v_current INTEGER;
    v_new INTEGER;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
    IF p_adjustment_type NOT IN ('increase', 'decrease', 'correction') THEN
        RAISE EXCEPTION 'Tipo de ajuste inválido: %', p_adjustment_type;
    END IF;

    SELECT id, quantity INTO v_inventory_id, v_current
    FROM public.inventory
    WHERE consultant_id = v_uid AND product_id = p_product_id
    ORDER BY (variant_id IS NULL) DESC, created_at LIMIT 1
    FOR UPDATE;

    IF v_inventory_id IS NULL THEN
        RAISE EXCEPTION 'El producto no está en tu inventario';
    END IF;

    IF p_adjustment_type = 'correction' THEN
        v_new := coalesce(p_previous_quantity, v_current) + p_quantity;
    ELSE
        v_new := v_current + p_quantity;
    END IF;

    IF v_new < 0 THEN
        RAISE EXCEPTION 'El ajuste dejaría el stock en negativo (stock actual: %)', v_current;
    END IF;

    INSERT INTO public.inventory_adjustments
        (consultant_id, product_id, adjustment_type, quantity, previous_quantity, reason, notes)
    VALUES
        (v_uid, p_product_id, p_adjustment_type, v_new - v_current, v_current, coalesce(p_reason, 'other'), p_notes);

    UPDATE public.inventory
    SET quantity = v_new, updated_at = timezone('utc'::text, now())
    WHERE id = v_inventory_id;

    RETURN jsonb_build_object('success', true, 'new_quantity', v_new, 'adjustment_quantity', v_new - v_current);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_inventory_adjustment(UUID, UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_inventory_adjustment(UUID, UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------
-- update_my_product
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
    ORDER BY (variant_id IS NULL) DESC, created_at LIMIT 1
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

REVOKE ALL ON FUNCTION public.update_my_product(UUID, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_product(UUID, NUMERIC, NUMERIC, JSONB) TO authenticated, service_role;
