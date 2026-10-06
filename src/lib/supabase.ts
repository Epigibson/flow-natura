import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared Supabase client for code used by both web and mobile (api.ts, reports.ts, ...).
 *
 * The mobile app needs its own client (AsyncStorage session), so it registers it with
 * `globalThis.__FLOW_SUPABASE__` when mobile/lib/supabase.ts loads. Every call made through
 * this proxy goes to the registered client; on the web nothing is registered and a default
 * client is created lazily.
 */
const supabaseUrl =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.PUBLIC_SUPABASE_URL) ||
  'https://tu-proyecto.supabase.co';

const supabaseAnonKey =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.PUBLIC_SUPABASE_ANON_KEY) ||
  'tu-anon-key';

let defaultClient: SupabaseClient | null = null;

function activeClient(): SupabaseClient {
  const injected = (globalThis as any).__FLOW_SUPABASE__ as SupabaseClient | undefined;
  if (injected) return injected;
  if (!defaultClient) defaultClient = createClient(supabaseUrl, supabaseAnonKey);
  return defaultClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = activeClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
