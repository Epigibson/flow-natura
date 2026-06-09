-- ==========================================
-- INCREMENTAL MIGRATION: restore_inventory_on_cancel
-- Description: Atomic inventory restore when an order is cancelled.
-- Avoids the read-then-write race condition in the client.
-- ==========================================

CREATE OR REPLACE FUNCTION restore_inventory_on_cancel(
    p_consultant_id UUID,
    p_product_id UUID,
    p_quantity INTEGER
)
RETURNS void AS $$
BEGIN
    UPDATE public.inventory
    SET
        quantity = quantity + p_quantity,
        updated_at = timezone('utc'::text, now())
    WHERE consultant_id = p_consultant_id
      AND product_id = p_product_id;

    -- If no row was updated (inventory row doesn't exist), create one
    IF NOT FOUND THEN
        INSERT INTO public.inventory (consultant_id, product_id, quantity)
        VALUES (p_consultant_id, p_product_id, p_quantity);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
