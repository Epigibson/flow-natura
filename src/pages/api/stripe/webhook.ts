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
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
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

          // Find user by stripe_customer_id
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('consultant_id')
            .eq('stripe_customer_id', customerId)
            .single();

          if (sub) {
            await supabase
              .from('subscriptions')
              .update({
                stripe_subscription_id: subscriptionId,
                plan,
                billing_period: billing,
                status: 'active',
                current_period_start: new Date((stripeSubscription as unknown as { current_period_start: number }).current_period_start * 1000).toISOString(),
                current_period_end: new Date((stripeSubscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
                trial_ends_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq('consultant_id', sub.consultant_id);
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

        await supabase
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

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            stripe_subscription_id: null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    // Still return 200 to prevent Stripe retries on processing errors
    return new Response(JSON.stringify({ received: true, error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
