-- ==========================================
-- INCREMENTAL MIGRATION: 20260324000001_sales_logic.sql
-- Description: Adds a trigger to automatically deduct stock from inventory 
-- when an order item is inserted.
-- ==========================================

-- Function to handle an inventory decrement when an order_item is created
CREATE OR REPLACE FUNCTION deduct_inventory_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_consultant_id UUID;
BEGIN
    -- Get the consultant_id from the parent order
    SELECT consultant_id INTO v_consultant_id 
    FROM public.orders 
    WHERE id = NEW.order_id;
    
    -- Deduct inventory for this consultant and product
    UPDATE public.inventory
    SET 
        quantity = quantity - NEW.quantity,
        updated_at = timezone('utc'::text, now())
    WHERE consultant_id = v_consultant_id
      AND product_id = NEW.product_id
      AND quantity >= NEW.quantity; -- Prevent negative stock, ideally the UI guards this

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto o el registro de inventario no existe.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to allow re-running safely
DROP TRIGGER IF EXISTS on_order_item_created ON public.order_items;

-- Create the trigger
CREATE TRIGGER on_order_item_created
    AFTER INSERT ON public.order_items
    FOR EACH ROW EXECUTE PROCEDURE deduct_inventory_on_sale();
