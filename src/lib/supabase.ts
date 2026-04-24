import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.PUBLIC_SUPABASE_URL : process.env.PUBLIC_SUPABASE_URL) || 'https://tu-proyecto.supabase.co';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.PUBLIC_SUPABASE_ANON_KEY : process.env.PUBLIC_SUPABASE_ANON_KEY) || 'tu-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
