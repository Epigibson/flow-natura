-- Dedicated inventory_adjustments table
-- Supports: increase (+), decrease (-), and correction (set exact quantity)
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    adjustment_type TEXT NOT NULL DEFAULT 'decrease', -- 'increase', 'decrease', 'correction'
    quantity INTEGER NOT NULL,  -- positive for increase, negative for decrease, exact for correction
    previous_quantity INTEGER,  -- stock before adjustment
    reason TEXT NOT NULL DEFAULT 'other',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultants can view their own adjustments."
    ON public.inventory_adjustments FOR SELECT
    USING (auth.uid() = consultant_id);

CREATE POLICY "Consultants can insert their own adjustments."
    ON public.inventory_adjustments FOR INSERT
    WITH CHECK (auth.uid() = consultant_id);
