import { supabase } from './supabase.ts';

export interface Subscription {
  id: string;
  consultant_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: 'trial' | 'basico' | 'pro' | 'premium';
  billing_period: 'monthly' | 'annual';
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

// Plan hierarchy for upgrade/downgrade logic
const PLAN_RANK: Record<string, number> = { trial: 0, basico: 1, pro: 2, premium: 3 };

// Plan limits
const PLAN_LIMITS: Record<string, { products: number; clients: number; features: string[] }> = {
  trial: {
    products: 9999, clients: 9999,
    features: ['dashboard', 'inventory', 'sales', 'clients', 'cobranza', 'abonos', 'catalogo_import', 'catalogo_digital'],
  },
  basico: {
    products: 50, clients: 20,
    features: ['dashboard', 'inventory', 'sales', 'clients'],
  },
  pro: {
    products: 9999, clients: 9999,
    features: ['dashboard', 'inventory', 'sales', 'clients', 'cobranza', 'abonos', 'catalogo_import', 'catalogo_digital', 'recordatorios'],
  },
  premium: {
    products: 9999, clients: 9999,
    features: ['dashboard', 'inventory', 'sales', 'clients', 'cobranza', 'abonos', 'catalogo_import', 'catalogo_digital', 'recordatorios', 'reportes_avanzados', 'ia_prediccion', 'soporte_prioritario', 'mentoria', 'exports'],
  },
};

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('consultant_id', userId)
    .single();

  if (error || !data) return null;
  return data as Subscription;
}

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
}

export function canAccess(plan: string, feature: string): boolean {
  const limits = getPlanLimits(plan);
  return limits.features.includes(feature);
}

export function isUpgrade(currentPlan: string, newPlan: string): boolean {
  return (PLAN_RANK[newPlan] || 0) > (PLAN_RANK[currentPlan] || 0);
}

export function isTrialActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.status !== 'trialing') return false;
  if (!sub.trial_ends_at) return false;
  return new Date(sub.trial_ends_at) > new Date();
}

export function getTrialDaysLeft(sub: Subscription | null): number {
  if (!sub || !sub.trial_ends_at) return 0;
  const diff = new Date(sub.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getPlanDisplayName(plan: string): string {
  const names: Record<string, string> = { trial: 'Prueba Gratuita', basico: 'Básico', pro: 'Pro', premium: 'Premium' };
  return names[plan] || plan;
}

export function getPlanPrice(plan: string, billing: string): number {
  const prices: Record<string, Record<string, number>> = {
    basico: { monthly: 79, annual_total: 660 },
    pro: { monthly: 149, annual_total: 1448 },
    premium: { monthly: 249, annual_total: 2484 },
  };
  if (billing === 'annual') {
    const total = prices[plan]?.annual_total || 0;
    return Math.round(total / 12 * 100) / 100;
  }
  return prices[plan]?.monthly || 0;
}

export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  return ['trialing', 'active'].includes(sub.status);
}
