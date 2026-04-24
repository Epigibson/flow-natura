import { createClient } from '@supabase/supabase-js';

// Support both import.meta.env (for Vite/Astro) and process.env (for node tests)
const env = typeof process !== 'undefined' && process.env ? process.env : (import.meta as any).env;

const supabaseUrl = env.PUBLIC_SUPABASE_URL || 'https://tu-proyecto.supabase.co';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || 'tu-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
