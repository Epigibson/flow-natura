import type { APIRoute } from 'astro';
import { getServiceSupabase } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

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
  } catch (err: unknown) {
    console.error('Status check error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
