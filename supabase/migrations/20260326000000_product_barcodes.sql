-- ==========================================
-- MIGRATION: 20260326000000_product_barcodes.sql
-- Description: Creates the product_barcodes table for linking
-- EAN barcodes to products. Required by the barcode scanner
-- (/inventario/escanear) and product registration (/inventario/nuevo).
-- ==========================================

CREATE TABLE IF NOT EXISTS public.product_barcodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ean TEXT NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(ean)
);

-- Fast lookups by EAN (the primary use-case in the scanner)
CREATE INDEX IF NOT EXISTS idx_product_barcodes_ean ON public.product_barcodes(ean);

-- Also index by product_id for reverse lookups
CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id ON public.product_barcodes(product_id);

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read barcodes (shared catalog)
CREATE POLICY "Authenticated users can view barcodes."
    ON public.product_barcodes FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can link new barcodes
CREATE POLICY "Authenticated users can insert barcodes."
    ON public.product_barcodes FOR INSERT
    TO authenticated
    WITH CHECK (true);
