-- Añadiendo campos encriptados de Natura a perfiles

ALTER TABLE public.consultant_profiles 
ADD COLUMN IF NOT EXISTS natura_email TEXT,
ADD COLUMN IF NOT EXISTS natura_password_encrypted TEXT,
ADD COLUMN IF NOT EXISTS is_natura_connected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS latest_growth_data JSONB,
ADD COLUMN IF NOT EXISTS growth_sync_date TIMESTAMP WITH TIME ZONE;
