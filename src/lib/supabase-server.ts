import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service_role key (bypasses RLS)
// Only use in API endpoints, NEVER in client code
export function getServiceSupabase() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key);
}
