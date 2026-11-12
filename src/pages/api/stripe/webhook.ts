import type { APIRoute } from 'astro';
import { stripe, getPlanFromPriceId } from '../../../lib/stripe';
import type { Stripe } from 'stripe';
import { getServiceSupabase } from '../../../lib/supabase-server';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig || '', webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  const supabase = getServiceSupabase();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (subscriptionId) {
          // Fetch the subscription to get plan details
          const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = stripeSubscription.items.data[0]?.price.id || '';
          const { plan, billing } = getPlanFromPriceId(priceId);

          const periodStart = new Date((stripeSubscription as unknown as { current_period_start: number }).current_period_start * 1000).toISOString();
          const periodEnd = new Date((stripeSubscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString();

          // Find user by stripe_customer_id
          const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .select('consultant_id')
            .eq('stripe_customer_id', customerId)
            .single();

          if (subError && subError.code !== 'PGRST116') {
            throw new Error('Error leyendo suscripción: ' + subError.message);
          }

          if (sub) {
            const { error } = await supabase
              .from('subscriptions')
              .update({
                stripe_subscription_id: subscriptionId,
                plan,
                billing_period: billing,
                status: 'active',
                current_period_start: periodStart,
                current_period_end: periodEnd,
                trial_ends_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq('consultant_id', sub.consultant_id);
            if (error) throw new Error('Error actualizando suscripción: ' + error.message);
          } else {
            // Row missing (checkout raced the insert): create it from session metadata.
            const consultantId = (session.metadata?.supabase_user_id || session.client_reference_id) as string | undefined;
            if (!consultantId) {
              throw new Error(`checkout.session.completed sin fila de suscripción ni metadata para customer ${customerId}`);
            }
            const { error } = await supabase
              .from('subscriptions')
              .upsert({
                consultant_id: consultantId,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                plan,
                billing_period: billing,
                status: 'active',
                current_period_start: periodStart,
                current_period_end: periodEnd,
                trial_ends_at: null,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'consultant_id' });
            if (error) throw new Error('Error creando suscripción: ' + error.message);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id || '';
        const { plan, billing } = getPlanFromPriceId(priceId);

        const statusMap: Record<string, string> = {
          active: 'active',
          past_due: 'past_due',
          unpaid: 'unpaid',
          canceled: 'canceled',
          trialing: 'trialing',
          incomplete: 'unpaid',
          incomplete_expired: 'canceled',
          paused: 'canceled',
        };

        const { error } = await supabase
          .from('subscriptions')
          .update({
            plan,
            billing_period: billing,
            status: statusMap[subscription.status] || subscription.status,
            current_period_start: new Date((subscription as unknown as { current_period_start: number }).current_period_start * 1000).toISOString(),
            current_period_end: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end || false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        if (error) throw new Error('Error actualizando suscripción: ' + error.message);

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            stripe_subscription_id: null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        if (error) throw new Error('Error cancelando suscripción: ' + error.message);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        if (error) throw new Error('Error marcando past_due: ' + error.message);

        break;
      }

      default:
        // Unhandled event type
    }
  } catch (err: unknown) {
    console.error('Webhook processing error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    // 500 so Stripe retries: a payment must never lose its activation silently.
    return new Response(JSON.stringify({ received: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
