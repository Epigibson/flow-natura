import Stripe from 'stripe';

// Server-side only — never import this in client code
const STRIPE_SECRET_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.STRIPE_SECRET_KEY) || process.env.STRIPE_SECRET_KEY || '';
export const stripe = new Stripe(STRIPE_SECRET_KEY);

// Plan → Price ID mapping
export function getPriceId(plan: string, billing: string): string {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || process.env;
  const map: Record<string, Record<string, string>> = {
    basico: {
      monthly: env.STRIPE_PRICE_BASICO_MONTHLY || '',
      annual: env.STRIPE_PRICE_BASICO_ANNUAL || '',
    },
    pro: {
      monthly: env.STRIPE_PRICE_PRO_MONTHLY || '',
      annual: env.STRIPE_PRICE_PRO_ANNUAL || '',
    },
    premium: {
      monthly: env.STRIPE_PRICE_PREMIUM_MONTHLY || '',
      annual: env.STRIPE_PRICE_PREMIUM_ANNUAL || '',
    },
  };
  return map[plan]?.[billing] || '';
}

// Reverse: Price ID → plan name
export function getPlanFromPriceId(priceId: string): { plan: string; billing: string } {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || process.env;
  const entries = [
    { plan: 'basico', billing: 'monthly', id: env.STRIPE_PRICE_BASICO_MONTHLY },
    { plan: 'basico', billing: 'annual', id: env.STRIPE_PRICE_BASICO_ANNUAL },
    { plan: 'pro', billing: 'monthly', id: env.STRIPE_PRICE_PRO_MONTHLY },
    { plan: 'pro', billing: 'annual', id: env.STRIPE_PRICE_PRO_ANNUAL },
    { plan: 'premium', billing: 'monthly', id: env.STRIPE_PRICE_PREMIUM_MONTHLY },
    { plan: 'premium', billing: 'annual', id: env.STRIPE_PRICE_PREMIUM_ANNUAL },
  ];
  const found = entries.find(e => e.id === priceId);
  return found ? { plan: found.plan, billing: found.billing } : { plan: 'unknown', billing: 'monthly' };
}
