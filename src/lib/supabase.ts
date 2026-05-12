import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_SUPABASE_URL) || 
  (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.PUBLIC_SUPABASE_URL) || 
  'https://tu-proyecto.supabase.co';

const supabaseAnonKey = 
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || 
  (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.PUBLIC_SUPABASE_ANON_KEY) || 
  'tu-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
