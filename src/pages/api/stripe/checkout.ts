import type { APIRoute } from 'astro';
import { stripe, getPriceId } from '../../../lib/stripe';
import { getServiceSupabase } from '../../../lib/supabase-server';
import { supabase } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    const userEmail = user.email;

    const body = await request.json();
    const { plan, billing_period } = body;

    if (!plan || !billing_period) {
      return new Response(JSON.stringify({ error: 'Missing required fields: plan, billing_period' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const priceId = getPriceId(plan, billing_period);
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Invalid plan or billing period, or Stripe Price IDs not configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serviceSupabase = getServiceSupabase();

    // Check if user already has a Stripe customer
    const { data: sub } = await serviceSupabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('consultant_id', userId)
      .single();

    let customerId = sub?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;

      // Save customer ID
      await serviceSupabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('consultant_id', userId);
    }

    // If user already has an active subscription, use Stripe Portal instead
    if (sub?.stripe_subscription_id) {
      // Redirect to portal for plan change
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${new URL(request.url).origin}/membresia`,
      });

      return new Response(JSON.stringify({ url: portalSession.url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create checkout session for new subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${new URL(request.url).origin}/membresia?success=true`,
      cancel_url: `${new URL(request.url).origin}/membresia?canceled=true`,
      subscription_data: {
        metadata: { supabase_user_id: userId, plan, billing_period },
      },
      locale: 'es',
      allow_promotion_codes: true,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    console.error('Stripe checkout error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
