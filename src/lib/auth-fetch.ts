/**
 * Authenticated fetch wrapper for Flow Natura API routes.
 *
 * Automatically attaches the current Supabase session token
 * as a Bearer token in the Authorization header.
 *
 * Usage:
 *   import { authFetch } from '../../lib/auth-fetch';
 *   const res = await authFetch('/api/gemini-analyze', { method: 'POST', body: ... });
 */
import { supabase } from './supabase';

export async function authFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Ensure Content-Type is set for JSON bodies (most common case)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...init, headers });
}
