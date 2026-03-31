import type { APIRoute } from 'astro';
import { getServiceSupabase } from '../../../lib/supabase-server';
import { supabase as anonSupabase } from '../../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.split(' ')[1];

    const { data: authData, error: authError } = await anonSupabase.auth.getUser(token);
    if (authError || !authData.user || authData.user.id !== userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token or user mismatch' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    const serviceSupabase = getServiceSupabase();
    const { data: sub, error } = await serviceSupabase
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
        await serviceSupabase
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
