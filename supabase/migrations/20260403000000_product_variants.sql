-- ==========================================
-- MIGRATION: 20260403000000_product_variants.sql
-- Description: Implements product variants system.
-- A single parent product can have N variants (tones, sizes, fragrances).
-- Inventory and barcodes can reference specific variants.
-- ==========================================

-- 1. Add has_variants flag to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false;

-- 2. Create product_variants table
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,                -- Código Natura de la variante
    variant_label TEXT NOT NULL,              -- Ej: "Tono 24F", "400ml", "Cereza"
    variant_type TEXT DEFAULT 'tono',         -- Ej: "tono", "tamaño", "fragancia"
    price DECIMAL(10,2),                      -- Precio específico (NULL = usa el del padre)
    cost DECIMAL(10,2),                       -- Costo específico (NULL = usa el del padre)
    points INTEGER,                           -- Puntos específicos (NULL = usa el del padre)
    image_url TEXT,                           -- Imagen específica de la variante
    sort_order INTEGER DEFAULT 0,             -- Orden de display
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast lookup by product
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
-- Partial index for active variants
CREATE INDEX IF NOT EXISTS idx_product_variants_active ON public.product_variants(product_id) WHERE deleted_at IS NULL;

-- 3. Add variant_id to inventory
ALTER TABLE public.inventory
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- Update unique constraint: a consultant can have stock per product+variant combo
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_consultant_id_product_id_key;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_consultant_product_variant_unique
    UNIQUE(consultant_id, product_id, variant_id);

-- 4. Add variant_id to product_barcodes
ALTER TABLE public.product_barcodes
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- ==========================================
-- RLS for product_variants
-- ==========================================
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- SELECT: Any authenticated user can view active variants (like products)
CREATE POLICY "Authenticated users can view active variants."
    ON public.product_variants FOR SELECT
    TO authenticated
    USING (deleted_at IS NULL);

-- INSERT: Authenticated users can add variants
CREATE POLICY "Authenticated users can insert variants."
    ON public.product_variants FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE: Authenticated users can update variants
CREATE POLICY "Authenticated users can update variants."
    ON public.product_variants FOR UPDATE
    TO authenticated
    USING (true);

-- DELETE: Authenticated users can delete variants
CREATE POLICY "Authenticated users can delete variants."
    ON public.product_variants FOR DELETE
    TO authenticated
    USING (true);

-- ==========================================
-- RPC FUNCTIONS
-- ==========================================

-- Upsert a product with its variants in one atomic operation
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
    v_has_variants := jsonb_array_length(p_variants) > 0;

    -- Upsert the parent product
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

    -- Upsert variants
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

-- Update the existing update_product to handle has_variants
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
    UPDATE public.products
    SET name = p_name,
        code = p_code,
        brand = p_brand,
        category = p_category,
        cost = p_cost,
        price = p_price,
        points = p_points,
        image_url = p_image_url,
        description = p_description,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- List all products (updated to include variant count)
-- Must drop first because return type changed from SETOF to TABLE
DROP FUNCTION IF EXISTS public.list_all_products(boolean);
CREATE OR REPLACE FUNCTION public.list_all_products(
    p_include_deleted BOOLEAN DEFAULT false
)
RETURNS TABLE (
    id UUID,
    code TEXT,
    name TEXT,
    category TEXT,
    description TEXT,
    price DECIMAL,
    cost DECIMAL,
    points INTEGER,
    image_url TEXT,
    brand TEXT,
    has_variants BOOLEAN,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    variant_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_include_deleted THEN
        RETURN QUERY
            SELECT p.id, p.code, p.name, p.category, p.description,
                   p.price, p.cost, p.points, p.image_url, p.brand,
                   p.has_variants, p.deleted_at, p.created_at, p.updated_at,
                   COUNT(pv.id) AS variant_count
            FROM public.products p
            LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
            GROUP BY p.id
            ORDER BY p.deleted_at NULLS FIRST, p.name ASC;
    ELSE
        RETURN QUERY
            SELECT p.id, p.code, p.name, p.category, p.description,
                   p.price, p.cost, p.points, p.image_url, p.brand,
                   p.has_variants, p.deleted_at, p.created_at, p.updated_at,
                   COUNT(pv.id) AS variant_count
            FROM public.products p
            LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
            WHERE p.deleted_at IS NULL
            GROUP BY p.id
            ORDER BY p.name ASC;
    END IF;
END;
$$;
