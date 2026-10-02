-- ==========================================
-- MIGRATION: 20261001000000_order_payments.sql
-- Description: Sales & payments integrity.
--   * order_payments: real table for contado / enganche / abonos
--     (replaces the JSON that lived in orders.notes).
--   * orders.installments / frequency / meta: structured sale terms.
--   * orders.notes becomes plain user text.
--   * order_balances view: paid / balance per order.
--   * Atomic RPCs: create_order, add_payment, delete_payment,
--     cancel_order, deliver_order (all scoped to auth.uid()).
--   * Single-row stock deduction/restore (no more double deduction).
--   * Removes the insecure restore_inventory_on_cancel RPC.
-- ==========================================

-- ------------------------------------------
-- 1. Inventory: merge duplicate rows with NULL variant_id and prevent new ones
--    (UNIQUE(consultant_id, product_id, variant_id) does not catch NULLs)
-- ------------------------------------------
WITH ranked AS (
    SELECT id, consultant_id, product_id,
           first_value(id) OVER w AS keeper_id,
           sum(quantity) OVER (PARTITION BY consultant_id, product_id) AS total_qty,
           row_number() OVER w AS rn
    FROM public.inventory
    WHERE variant_id IS NULL
    WINDOW w AS (PARTITION BY consultant_id, product_id ORDER BY created_at, id)
)
UPDATE public.inventory i
SET quantity = r.total_qty
FROM ranked r
WHERE i.id = r.keeper_id AND r.rn = 1 AND r.total_qty <> i.quantity;

DELETE FROM public.inventory i
USING (
    SELECT id, row_number() OVER (PARTITION BY consultant_id, product_id ORDER BY created_at, id) AS rn
    FROM public.inventory
    WHERE variant_id IS NULL
) d
WHERE i.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_consultant_product_no_variant_uniq
    ON public.inventory (consultant_id, product_id)
    WHERE variant_id IS NULL;

-- ------------------------------------------
-- 2. Orders: structured terms
-- ------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS installments INTEGER,
    ADD COLUMN IF NOT EXISTS frequency TEXT,
    ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ------------------------------------------
-- 3. order_payments
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    kind TEXT NOT NULL DEFAULT 'abono' CHECK (kind IN ('contado', 'enganche', 'abono')),
    paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order ON public.order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_consultant ON public.order_payments(consultant_id);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

-- Read-only from the client: every write goes through the RPCs below.
DROP POLICY IF EXISTS "Consultants view their own payments." ON public.order_payments;
CREATE POLICY "Consultants view their own payments."
    ON public.order_payments FOR SELECT
    USING (auth.uid() = consultant_id);

-- ------------------------------------------
-- 4. Backfill from the legacy JSON in orders.notes
-- ------------------------------------------
DO $$
DECLARE
    r RECORD;
    j JSONB;
    h JSONB;
    v_enganche NUMERIC;
    v_comment TEXT;
    v_new_notes TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM public.order_payments LIMIT 1) THEN
        RAISE NOTICE 'order_payments already populated, skipping backfill';
        RETURN;
    END IF;

    FOR r IN SELECT id, consultant_id, total_amount, payment_method, notes, status, created_at FROM public.orders LOOP
        j := NULL;
        IF r.notes IS NOT NULL AND r.notes ~ '^\s*\{' THEN
            BEGIN
                j := r.notes::jsonb;
            EXCEPTION WHEN others THEN
                j := NULL;
            END;
        END IF;

        IF lower(coalesce(r.payment_method, '')) = 'abonos' THEN
            IF j IS NOT NULL THEN
                v_enganche := coalesce(nullif(j->>'enganche', '')::numeric, 0);
                IF v_enganche > 0 THEN
                    INSERT INTO public.order_payments (order_id, consultant_id, amount, kind, paid_at)
                    VALUES (r.id, r.consultant_id, v_enganche, 'enganche', r.created_at);
                END IF;

                IF jsonb_typeof(j->'historial_abonos') = 'array' THEN
                    FOR h IN SELECT * FROM jsonb_array_elements(j->'historial_abonos') LOOP
                        IF coalesce(nullif(h->>'monto', '')::numeric, 0) > 0 THEN
                            INSERT INTO public.order_payments (order_id, consultant_id, amount, kind, paid_at)
                            VALUES (
                                r.id, r.consultant_id, (h->>'monto')::numeric, 'abono',
                                coalesce(nullif(h->>'fecha', '')::timestamptz, r.created_at)
                            );
                        END IF;
                    END LOOP;
                END IF;

                UPDATE public.orders SET
                    installments = greatest(1, coalesce(nullif(j->>'pagos', '')::numeric, 1))::int,
                    frequency = nullif(j->>'frecuencia', '')
                WHERE id = r.id;
            END IF;
        ELSIF r.status <> 'cancelled' AND r.total_amount > 0 THEN
            -- Contado sales were always considered paid at sale time.
            INSERT INTO public.order_payments (order_id, consultant_id, amount, kind, paid_at)
            VALUES (r.id, r.consultant_id, r.total_amount, 'contado', r.created_at);
        END IF;

        -- orders.notes becomes plain text; keep the rest of the JSON in meta.
        IF j IS NOT NULL THEN
            v_comment := nullif(trim(coalesce(j->>'comentario', j->>'notas_internas', '')), '');
            UPDATE public.orders SET
                notes = v_comment,
                meta = j - 'enganche' - 'historial_abonos' - 'pagos_completados' - 'comentario' - 'notas_internas'
            WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------
-- 5. order_balances view (RLS of the base tables applies)
-- ------------------------------------------
CREATE OR REPLACE VIEW public.order_balances
WITH (security_invoker = true) AS
SELECT
    o.id AS order_id,
    o.consultant_id,
    o.customer_id,
    o.status,
    o.payment_method,
    o.total_amount,
    coalesce(p.paid, 0)::numeric(10, 2) AS paid_amount,
    (CASE WHEN o.status = 'cancelled' THEN 0
          ELSE greatest(o.total_amount - coalesce(p.paid, 0), 0) END)::numeric(10, 2) AS balance
FROM public.orders o
LEFT JOIN (
    SELECT order_id, sum(amount) AS paid
    FROM public.order_payments
    GROUP BY order_id
) p ON p.order_id = o.id;

GRANT SELECT ON public.order_balances TO authenticated;

-- ------------------------------------------
-- 6. Stock deduction hits exactly ONE inventory row
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
    ORDER BY created_at
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
-- 7. RPCs
-- ------------------------------------------

-- 7.1 create_order: order + items + initial payment, all-or-nothing.
CREATE OR REPLACE FUNCTION public.create_order(
    p_customer_id UUID,
    p_payment_method TEXT,
    p_items JSONB,
    p_enganche NUMERIC DEFAULT 0,
    p_installments INTEGER DEFAULT NULL,
    p_frequency TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_meta JSONB DEFAULT '{}'::jsonb,
    p_global_discount NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_customer_id UUID := p_customer_id;
    v_order_id UUID;
    v_item JSONB;
    v_total NUMERIC := 0;
    v_method TEXT := lower(coalesce(p_payment_method, 'contado'));
    v_qty INTEGER;
    v_price NUMERIC;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;
    IF v_method NOT IN ('contado', 'abonos') THEN
        RAISE EXCEPTION 'Método de pago inválido: %', p_payment_method;
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La venta no tiene productos';
    END IF;

    -- Customer: must belong to the caller; none => walk-in customer.
    IF v_customer_id IS NULL THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE consultant_id = v_uid AND full_name = 'Cliente Mostrador'
        ORDER BY created_at LIMIT 1;
        IF v_customer_id IS NULL THEN
            INSERT INTO public.customers (consultant_id, full_name, phone, email)
            VALUES (v_uid, 'Cliente Mostrador', '', '')
            RETURNING id INTO v_customer_id;
        END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer_id AND consultant_id = v_uid) THEN
        RAISE EXCEPTION 'Cliente no encontrado';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item->>'quantity')::integer;
        v_price := (v_item->>'unit_price')::numeric;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida';
        END IF;
        IF v_price IS NULL OR v_price < 0 THEN
            RAISE EXCEPTION 'Precio inválido';
        END IF;
        v_total := v_total + v_qty * v_price;
    END LOOP;
    IF coalesce(p_global_discount, 0) < 0 OR coalesce(p_global_discount, 0) > v_total THEN
        RAISE EXCEPTION 'Descuento inválido';
    END IF;
    -- Items carry their own per-unit discounts; the global discount applies on top.
    v_total := round(v_total - coalesce(p_global_discount, 0), 2);

    IF v_method = 'abonos' THEN
        IF coalesce(p_enganche, 0) < 0 OR coalesce(p_enganche, 0) > v_total THEN
            RAISE EXCEPTION 'El enganche no puede ser mayor al total de la venta';
        END IF;
        IF coalesce(p_installments, 1) < 1 THEN
            RAISE EXCEPTION 'El número de pagos debe ser al menos 1';
        END IF;
    END IF;

    INSERT INTO public.orders (
        consultant_id, customer_id, status, total_amount, payment_method,
        notes, installments, frequency, meta
    ) VALUES (
        v_uid, v_customer_id, 'pending', v_total, v_method,
        nullif(trim(coalesce(p_notes, '')), ''),
        CASE WHEN v_method = 'abonos' THEN greatest(1, coalesce(p_installments, 1)) END,
        CASE WHEN v_method = 'abonos' THEN p_frequency END,
        coalesce(p_meta, '{}'::jsonb)
    ) RETURNING id INTO v_order_id;

    -- The AFTER INSERT trigger deducts stock and raises if there is not enough.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
        VALUES (
            v_order_id,
            (v_item->>'product_id')::uuid,
            (v_item->>'quantity')::integer,
            round((v_item->>'unit_price')::numeric, 2)
        );
    END LOOP;

    IF v_method = 'contado' THEN
        IF v_total > 0 THEN
            INSERT INTO public.order_payments (order_id, consultant_id, amount, kind)
            VALUES (v_order_id, v_uid, v_total, 'contado');
        END IF;
    ELSIF coalesce(p_enganche, 0) > 0 THEN
        INSERT INTO public.order_payments (order_id, consultant_id, amount, kind)
        VALUES (v_order_id, v_uid, round(p_enganche, 2), 'enganche');
    END IF;

    RETURN v_order_id;
END;
$$;

-- 7.2 add_payment: abono with balance validation and row lock.
CREATE OR REPLACE FUNCTION public.add_payment(
    p_order_id UUID,
    p_amount NUMERIC,
    p_kind TEXT DEFAULT 'abono'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_order RECORD;
    v_paid NUMERIC;
    v_amount NUMERIC := round(p_amount, 2);
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0'; END IF;
    IF p_kind NOT IN ('enganche', 'abono') THEN RAISE EXCEPTION 'Tipo de pago inválido'; END IF;

    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND consultant_id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
    IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'La venta está cancelada'; END IF;

    SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.order_payments WHERE order_id = p_order_id;

    IF v_amount > (v_order.total_amount - v_paid) + 0.005 THEN
        RAISE EXCEPTION 'El monto excede el saldo pendiente ($%)', round(v_order.total_amount - v_paid, 2);
    END IF;

    INSERT INTO public.order_payments (order_id, consultant_id, amount, kind)
    VALUES (p_order_id, v_uid, v_amount, p_kind);

    RETURN jsonb_build_object(
        'paid_amount', v_paid + v_amount,
        'balance', greatest(v_order.total_amount - v_paid - v_amount, 0)
    );
END;
$$;

-- 7.3 delete_payment
CREATE OR REPLACE FUNCTION public.delete_payment(p_payment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_pay RECORD;
    v_status public.order_status;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

    SELECT * INTO v_pay FROM public.order_payments WHERE id = p_payment_id AND consultant_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;

    SELECT status INTO v_status FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;
    IF v_status = 'cancelled' THEN RAISE EXCEPTION 'La venta está cancelada'; END IF;

    DELETE FROM public.order_payments WHERE id = p_payment_id;
END;
$$;

-- 7.4 cancel_order: restore stock + mark cancelled atomically (idempotent-safe).
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
        ORDER BY created_at LIMIT 1
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

-- 7.5 deliver_order: only pending -> delivered.
CREATE OR REPLACE FUNCTION public.deliver_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.orders
    SET status = 'delivered', updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id AND consultant_id = auth.uid() AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solo se pueden entregar ventas pendientes';
    END IF;
END;
$$;

-- 7.6 The old restore RPC let any user inflate anyone's stock (consultant id came from the client).
DROP FUNCTION IF EXISTS public.restore_inventory_on_cancel(UUID, UUID, INTEGER);

-- Lock down execution: only authenticated users.
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, JSONB, NUMERIC, INTEGER, TEXT, TEXT, JSONB, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_payment(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_payment(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_order(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deliver_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, JSONB, NUMERIC, INTEGER, TEXT, TEXT, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_payment(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_order(UUID) TO authenticated;
