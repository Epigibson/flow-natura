-- Add brand column to products table for Natura/Avon/Casa&Estilo
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT 'Natura';

-- Ensure image_url column exists (it does from init, but just in case)
-- ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;
