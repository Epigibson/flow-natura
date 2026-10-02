-- ==========================================
-- MIGRATION: 20261002000001_profile_fields.sql
-- Description: Profile fields the apps already read/write but no migration
-- created (avatar_url) or that only lived in the web browser's localStorage
-- (phone, business name, city). Idempotent.
-- ==========================================
ALTER TABLE public.consultant_profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS business_name TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT;

-- Public avatars bucket (only when running on Supabase)
DO $$
BEGIN
    IF to_regclass('storage.buckets') IS NOT NULL THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('avatars', 'avatars', true)
        ON CONFLICT (id) DO NOTHING;

        DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
        CREATE POLICY "avatars_public_read" ON storage.objects
            FOR SELECT USING (bucket_id = 'avatars');

        -- Files are named "<user id>-<timestamp>.<ext>": users only manage their own.
        DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
        CREATE POLICY "avatars_owner_insert" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (bucket_id = 'avatars' AND name LIKE auth.uid()::text || '-%');

        DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
        CREATE POLICY "avatars_owner_update" ON storage.objects
            FOR UPDATE TO authenticated
            USING (bucket_id = 'avatars' AND name LIKE auth.uid()::text || '-%');
    END IF;
END $$;
