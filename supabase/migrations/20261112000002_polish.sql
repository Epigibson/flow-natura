-- ==========================================
-- MIGRATION: 20261112000002_polish.sql
-- Description: lote-4 leftovers from the audit.
--   1. get_public_catalog: variants without consultant stock no longer leak
--      into shared links, and the price comes from MIN(i.price) instead of an
--      ambiguous MAX over mixed inventory overrides.
--   2. upsert_product_with_variants: re-syncing a soft-deleted product
--      restores it (deleted_at = NULL).
--   3. handle_new_user: missing full_name or duplicate natura_code must not
--      abort the whole signup.
--   4. product_barcodes: UPDATE/DELETE so a wrong link can be fixed.
--   5. avatars: owner DELETE policy.
--   6. Drop dead stub update_inventory_on_delivery().
--   7. Replace deprecated auth.role() policies with TO authenticated.
-- ==========================================

-- ------------------------------------------
-- 1. get_public_catalog
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_catalog(p_consultant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.consultant_profiles WHERE id = p_consultant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Consultant not found', 'products', '[]'::jsonb);
    END IF;

    SELECT jsonb_build_object(
        'success', true,
        'products', COALESCE(jsonb_agg(product_data ORDER BY product_data->>'name'), '[]'::jsonb)
    )
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'price', COALESCE(MIN(i.price), p.price),
            'code', p.code,
            'brand', COALESCE(p.brand, ''),
            'category', COALESCE(p.category, ''),
            'image_url', COALESCE(p.image_url, ''),
            'has_variants', COALESCE(p.has_variants, false),
            'stock', SUM(i.quantity),
            'variants', COALESCE(
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', pv.id,
                        'code', pv.code,
                        'label', pv.variant_label,
                        'type', COALESCE(pv.variant_type, 'tono'),
                        'price', COALESCE(pv.price, p.price),
                        'image_url', COALESCE(pv.image_url, '')
                    ) ORDER BY pv.sort_order
                )
                FROM public.product_variants pv
                WHERE pv.product_id = p.id
                  AND pv.deleted_at IS NULL
                  AND (
                    -- All variants when the consultant stocks the base product,
                    -- otherwise only variants they actually carry in stock.
                    EXISTS (SELECT 1 FROM public.inventory ib
                            WHERE ib.consultant_id = p_consultant_id AND ib.product_id = p.id
                              AND ib.variant_id IS NULL AND ib.quantity > 0)
                    OR EXISTS (SELECT 1 FROM public.inventory iv
                               WHERE iv.consultant_id = p_consultant_id AND iv.product_id = p.id
                                 AND iv.variant_id = pv.id AND iv.quantity > 0)
                  )
                ), '[]'::jsonb)
        ) AS product_data
        FROM public.inventory i
        JOIN public.products p ON p.id = i.product_id
        WHERE i.consultant_id = p_consultant_id
          AND i.quantity > 0
          AND p.deleted_at IS NULL
        GROUP BY p.id, p.name, p.price, p.code, p.brand, p.category, p.image_url, p.has_variants
    ) sub;

    IF v_result IS NULL THEN
        v_result := jsonb_build_object('success', true, 'products', '[]'::jsonb);
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalog(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(UUID) TO anon, authenticated, service_role;

-- ------------------------------------------
-- 2. upsert_product_with_variants: restore soft-deleted on re-sync
--    (same body as 20261112000000 + deleted_at = NULL)
-- ------------------------------------------
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
        deleted_at = NULL,
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
                deleted_at = NULL,
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

-- ------------------------------------------
-- 3. handle_new_user: never abort the signup
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.consultant_profiles (id, full_name, natura_code, level)
    VALUES (
      new.id,
      COALESCE(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Consultora'),
      nullif(trim(new.raw_user_meta_data ->> 'natura_code'), ''),
      'Semilla'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- Duplicate natura_code: register the user without the code instead of failing signup
    INSERT INTO public.consultant_profiles (id, full_name, level)
    VALUES (
      new.id,
      COALESCE(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Consultora'),
      'Semilla'
    )
    ON CONFLICT (id) DO NOTHING;
  END;

  -- Auto-create 15-day trial subscription
  INSERT INTO public.subscriptions (consultant_id, plan, status, trial_ends_at)
  VALUES (
    new.id,
    'trial',
    'trialing',
    now() + interval '15 days'
  )
  ON CONFLICT (consultant_id) DO NOTHING;

  RETURN new;
END;
$$;

-- ------------------------------------------
-- 4. product_barcodes: allow fixing a wrong link
-- ------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can update barcodes." ON public.product_barcodes;
CREATE POLICY "Authenticated users can update barcodes."
    ON public.product_barcodes FOR UPDATE
    TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete barcodes." ON public.product_barcodes;
CREATE POLICY "Authenticated users can delete barcodes."
    ON public.product_barcodes FOR DELETE
    TO authenticated
    USING (true);

-- ------------------------------------------
-- 5. avatars: owner can delete their files
-- ------------------------------------------
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND name LIKE auth.uid()::text || '-%');

-- ------------------------------------------
-- 6. Dead stub (real deduction lives in deduct_inventory_on_sale)
-- ------------------------------------------
DROP FUNCTION IF EXISTS public.update_inventory_on_delivery();

-- ------------------------------------------
-- 7. auth.role() is deprecated: scope policies to the role directly
-- ------------------------------------------
DROP POLICY IF EXISTS "community_posts_select" ON public.community_posts;
CREATE POLICY "community_posts_select" ON public.community_posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "community_reactions_select" ON public.community_reactions;
CREATE POLICY "community_reactions_select" ON public.community_reactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "community_comments_select" ON public.community_comments;
CREATE POLICY "community_comments_select" ON public.community_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mentorship_modules_select" ON public.mentorship_modules;
CREATE POLICY "mentorship_modules_select" ON public.mentorship_modules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mentorship_lessons_select" ON public.mentorship_lessons;
CREATE POLICY "mentorship_lessons_select" ON public.mentorship_lessons
  FOR SELECT TO authenticated USING (true);
