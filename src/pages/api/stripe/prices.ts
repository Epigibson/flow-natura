import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const secretKey = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
    const stripeClient = new Stripe(secretKey);

    // Read price IDs from env
    const priceIds: Record<string, string> = {
      basico_monthly: import.meta.env.STRIPE_PRICE_BASICO_MONTHLY || process.env.STRIPE_PRICE_BASICO_MONTHLY || '',
      basico_annual: import.meta.env.STRIPE_PRICE_BASICO_ANNUAL || process.env.STRIPE_PRICE_BASICO_ANNUAL || '',
      pro_monthly: import.meta.env.STRIPE_PRICE_PRO_MONTHLY || process.env.STRIPE_PRICE_PRO_MONTHLY || '',
      pro_annual: import.meta.env.STRIPE_PRICE_PRO_ANNUAL || process.env.STRIPE_PRICE_PRO_ANNUAL || '',
      premium_monthly: import.meta.env.STRIPE_PRICE_PREMIUM_MONTHLY || process.env.STRIPE_PRICE_PREMIUM_MONTHLY || '',
      premium_annual: import.meta.env.STRIPE_PRICE_PREMIUM_ANNUAL || process.env.STRIPE_PRICE_PREMIUM_ANNUAL || '',
    };

    // Debug: log which IDs we have
    const validIds = Object.entries(priceIds).filter(([, v]) => v && v.length > 5);
    console.log('Stripe price IDs found:', validIds.map(([k, v]) => `${k}=${v.slice(0, 15)}...`));

    if (validIds.length === 0) {
      return new Response(JSON.stringify({
        error: 'No Stripe Price IDs configured in .env',
        plans: {
          basico: { monthly: 79, annual_total: 660, annual_per_month: 55, discount: 30 },
          pro: { monthly: 149, annual_total: 1448, annual_per_month: 120.67, discount: 19 },
          premium: { monthly: 249, annual_total: 2484, annual_per_month: 207, discount: 17 },
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Reverse map: price_id → { plan, type }
    const mapping: Record<string, { plan: string; type: string }> = {};
    mapping[priceIds.basico_monthly] = { plan: 'basico', type: 'monthly' };
    mapping[priceIds.basico_annual] = { plan: 'basico', type: 'annual' };
    mapping[priceIds.pro_monthly] = { plan: 'pro', type: 'monthly' };
    mapping[priceIds.pro_annual] = { plan: 'pro', type: 'annual' };
    mapping[priceIds.premium_monthly] = { plan: 'premium', type: 'monthly' };
    mapping[priceIds.premium_annual] = { plan: 'premium', type: 'annual' };

    // Fetch all prices from Stripe in parallel
    const results = await Promise.all(
      validIds.map(([, id]) =>
        stripeClient.prices.retrieve(id).catch(err => {
          console.error(`Failed to fetch price ${id}:`, err instanceof Error ? err.message : 'Unknown error');
          return null;
        })
      )
    );

    // Build plans object
    const plans: Record<string, any> = {
      basico: { monthly: 0, annual_total: 0, annual_per_month: 0 },
      pro: { monthly: 0, annual_total: 0, annual_per_month: 0 },
      premium: { monthly: 0, annual_total: 0, annual_per_month: 0 },
    };

    for (const price of results) {
      if (!price) continue;
      const info = mapping[price.id];
      if (!info) continue;

      // Stripe stores amounts in centavos for MXN
      const amount = (price.unit_amount || 0) / 100;

      if (info.type === 'monthly') {
        plans[info.plan].monthly = amount;
      } else {
        plans[info.plan].annual_total = amount;
        plans[info.plan].annual_per_month = Math.round(amount / 12 * 100) / 100;
      }
    }

    // Calculate discount percentage per plan
    for (const plan of Object.values(plans)) {
      if (plan.monthly > 0 && plan.annual_per_month > 0) {
        plan.discount = Math.round((1 - plan.annual_per_month / plan.monthly) * 100);
      }
    }

    console.log('Stripe prices loaded:', JSON.stringify(plans));

    return new Response(JSON.stringify({ plans }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: unknown) {
    console.error('Stripe prices error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
