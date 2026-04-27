/**
 * Flow Natura — API Route Authentication Helper
 *
 * Provides a reusable auth middleware for all API routes.
 * Validates the Bearer token from the Authorization header
 * against Supabase Auth and returns the authenticated user.
 *
 * Usage in API routes:
 *   const authResult = await requireAuth(request);
 *   if (authResult.error) return authResult.error;
 *   const user = authResult.user;
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || '';

interface AuthSuccess {
  user: { id: string; email?: string; [key: string]: any };
  error: null;
}

interface AuthFailure {
  user: null;
  error: Response;
}

type AuthResult = AuthSuccess | AuthFailure;

/**
 * Validate the Bearer token from the request and return the authenticated user.
 * If auth fails, returns a pre-built Response that can be returned directly.
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      user: null,
      error: new Response(
        JSON.stringify({ error: 'No autorizado: Token faltante o inválido' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  const token = authHeader.split(' ')[1];

  // Use the anon client to validate the token (not service_role)
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return {
      user: null,
      error: new Response(
        JSON.stringify({ error: 'No autorizado: Token inválido o expirado' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { user: data.user, error: null };
}
