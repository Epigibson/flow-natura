-- ==========================================
-- MIGRATION: 20260326000001_adjustment_rpc.sql
-- Description: Atomic RPC function for inventory adjustments.
-- Replaces the current 2-step client-side approach
-- (insert adjustment + update stock) with a single
-- transactional operation to prevent data inconsistencies.
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
    v_new_quantity INTEGER;
    v_inventory_id UUID;
BEGIN
    -- Validate adjustment type
    IF p_adjustment_type NOT IN ('increase', 'decrease', 'correction') THEN
        RAISE EXCEPTION 'Invalid adjustment_type: %. Must be increase, decrease, or correction.', p_adjustment_type;
    END IF;

    -- Calculate new quantity based on adjustment type
    IF p_adjustment_type = 'increase' THEN
        v_new_quantity := p_previous_quantity + p_quantity;
    ELSIF p_adjustment_type = 'decrease' THEN
        -- p_quantity comes as negative from the client
        v_new_quantity := GREATEST(0, p_previous_quantity + p_quantity);
    ELSE
        -- correction: p_quantity = desired_qty - current_qty
        v_new_quantity := p_previous_quantity + p_quantity;
        -- Ensure non-negative
        IF v_new_quantity < 0 THEN
            v_new_quantity := 0;
        END IF;
    END IF;

    -- Step 1: Record the adjustment in the audit log
    INSERT INTO public.inventory_adjustments
        (consultant_id, product_id, adjustment_type, quantity, previous_quantity, reason, notes)
    VALUES
        (p_consultant_id, p_product_id, p_adjustment_type, p_quantity, p_previous_quantity, p_reason, p_notes);

    -- Step 2: Update the actual stock (atomic with the insert above)
    UPDATE public.inventory
    SET quantity = v_new_quantity,
        updated_at = timezone('utc'::text, now())
    WHERE consultant_id = p_consultant_id
      AND product_id = p_product_id
    RETURNING id INTO v_inventory_id;

    IF v_inventory_id IS NULL THEN
        RAISE EXCEPTION 'Inventory record not found for consultant % and product %', p_consultant_id, p_product_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'new_quantity', v_new_quantity,
        'adjustment_quantity', p_quantity
    );
END;
$$;
