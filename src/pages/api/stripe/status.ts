import type { APIRoute } from 'astro';
import { getServiceSupabase } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {



    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = getServiceSupabase();
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getServiceSupabase();
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('consultant_id', userId)
      .single();

    if (error || !sub) {
      return new Response(JSON.stringify({
        plan: 'trial',
        status: 'trialing',
        subscription: null,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if trial expired
    if (sub.status === 'trialing' && sub.trial_ends_at) {
      if (new Date(sub.trial_ends_at) < new Date()) {
        // Trial has expired, update status
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('consultant_id', userId);
        sub.status = 'canceled';
      }
    }

    return new Response(JSON.stringify({
      plan: sub.plan,
      status: sub.status,
      subscription: sub,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (err) {
    console.error('Status check error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
