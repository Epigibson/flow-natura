-- ==========================================
-- MIGRATION: 20261002000000_catalog_guards.sql
-- Description: The products catalog is shared by every consultant, but any
-- authenticated user could edit or soft-delete any product (hiding it, and the
-- names/prices in sales history, for everyone). Edits and deletes are now only
-- allowed while no OTHER consultant stocks the product.
-- ==========================================

CREATE OR REPLACE FUNCTION public.product_used_by_others(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.inventory i
        WHERE i.product_id = p_product_id AND i.consultant_id <> auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.product_id = p_product_id AND o.consultant_id <> auth.uid()
    );
$$;
GRANT EXECUTE ON FUNCTION public.product_used_by_others(UUID) TO authenticated;

-- Direct UPDATE through PostgREST
DROP POLICY IF EXISTS "Authenticated users can update products." ON public.products;
DROP POLICY IF EXISTS "Update products not used by other consultants." ON public.products;
CREATE POLICY "Update products not used by other consultants."
    ON public.products FOR UPDATE
    TO authenticated
    USING (NOT public.product_used_by_others(id))
    WITH CHECK (NOT public.product_used_by_others(id));

-- Hard DELETE is never needed (order_items.product_id is RESTRICT); soft delete only.
DROP POLICY IF EXISTS "Authenticated users can delete products." ON public.products;

CREATE OR REPLACE FUNCTION public.soft_delete_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

-- ==========================================
-- add_stock: atomic increment (client-side read-then-write lost updates and
-- ignored errors). Items: [{ "product_id": uuid, "quantity": int > 0 }]
-- ==========================================
CREATE OR REPLACE FUNCTION public.add_stock(p_items JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_item JSONB;
    v_qty INTEGER;
    v_count INTEGER := 0;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Lista de productos inválida'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item->>'quantity')::integer;
        IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

        INSERT INTO public.inventory (consultant_id, product_id, quantity)
        VALUES (v_uid, (v_item->>'product_id')::uuid, v_qty)
        ON CONFLICT (consultant_id, product_id) WHERE variant_id IS NULL
        DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity,
                      updated_at = timezone('utc'::text, now());
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.add_stock(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_stock(JSONB) TO authenticated;

-- ==========================================
-- apply_inventory_adjustment: scoped to auth.uid() (it trusted p_consultant_id,
-- so any user could change anyone's stock) and computed from the locked row
-- instead of the client's possibly stale p_previous_quantity.
-- p_quantity is signed for increase/decrease; for 'correction' the target is
-- p_previous_quantity + p_quantity (what the user saw when typing the new count).
-- ==========================================
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
    ORDER BY created_at LIMIT 1
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
