import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  getPlanLimits,
  canAccess,
  isUpgrade,
  isTrialActive,
  getTrialDaysLeft,
  getPlanDisplayName,
  getPlanPrice,
  isSubscriptionActive,
  type Subscription
} from './subscription.ts';

describe('Subscription Utility Functions', () => {
  describe('getPlanLimits', () => {
    test('returns trial limits for unknown plan', () => {
      const limits = getPlanLimits('unknown_plan');
      assert.strictEqual(limits.products, 9999);
      assert.ok(limits.features.includes('dashboard'));
    });

    test('returns basico limits', () => {
      const limits = getPlanLimits('basico');
      assert.strictEqual(limits.products, 50);
      assert.strictEqual(limits.clients, 20);
      assert.ok(limits.features.includes('dashboard'));
      assert.ok(!limits.features.includes('recordatorios'));
    });

    test('returns premium limits', () => {
      const limits = getPlanLimits('premium');
      assert.strictEqual(limits.products, 9999);
      assert.ok(limits.features.includes('mentoria'));
    });
  });

  describe('canAccess', () => {
    test('trial can access basic features', () => {
      assert.ok(canAccess('trial', 'dashboard'));
      assert.ok(canAccess('trial', 'inventory'));
    });

    test('basico cannot access advanced features', () => {
      assert.ok(!canAccess('basico', 'recordatorios'));
      assert.ok(!canAccess('basico', 'reportes_avanzados'));
    });

    test('premium can access advanced features', () => {
      assert.ok(canAccess('premium', 'ia_prediccion'));
      assert.ok(canAccess('premium', 'mentoria'));
    });

    test('unknown plan defaults to trial features', () => {
      assert.ok(canAccess('unknown_plan', 'dashboard'));
    });
  });

  describe('isUpgrade', () => {
    test('trial to basico is an upgrade', () => {
      assert.ok(isUpgrade('trial', 'basico'));
    });

    test('basico to pro is an upgrade', () => {
      assert.ok(isUpgrade('basico', 'pro'));
    });

    test('pro to premium is an upgrade', () => {
      assert.ok(isUpgrade('pro', 'premium'));
    });

    test('premium to pro is not an upgrade', () => {
      assert.ok(!isUpgrade('premium', 'pro'));
    });

    test('basico to trial is not an upgrade', () => {
      assert.ok(!isUpgrade('basico', 'trial'));
    });

    test('same plan is not an upgrade', () => {
      assert.ok(!isUpgrade('pro', 'pro'));
    });

    test('unknown plan handles default ranks gracefully', () => {
      assert.ok(isUpgrade('unknown', 'basico'));
      assert.ok(!isUpgrade('basico', 'unknown'));
    });
  });

  describe('isTrialActive', () => {
    test('returns false for null subscription', () => {
      assert.ok(!isTrialActive(null));
    });

    test('returns false if status is not trialing', () => {
      const sub = { status: 'active', trial_ends_at: new Date(Date.now() + 100000).toISOString() } as Subscription;
      assert.ok(!isTrialActive(sub));
    });

    test('returns false if trial_ends_at is missing', () => {
      const sub = { status: 'trialing', trial_ends_at: null } as Subscription;
      assert.ok(!isTrialActive(sub));
    });

    test('returns false if trial period is over', () => {
      const sub = { status: 'trialing', trial_ends_at: new Date(Date.now() - 100000).toISOString() } as Subscription;
      assert.ok(!isTrialActive(sub));
    });

    test('returns true if trial is active and in the future', () => {
      const sub = { status: 'trialing', trial_ends_at: new Date(Date.now() + 86400000).toISOString() } as Subscription; // +1 day
      assert.ok(isTrialActive(sub));
    });
  });

  describe('getTrialDaysLeft', () => {
    test('returns 0 for null subscription', () => {
      assert.strictEqual(getTrialDaysLeft(null), 0);
    });

    test('returns 0 if trial_ends_at is missing', () => {
      const sub = { status: 'trialing', trial_ends_at: null } as Subscription;
      assert.strictEqual(getTrialDaysLeft(sub), 0);
    });

    test('returns 0 if trial period is in the past', () => {
      const sub = { status: 'trialing', trial_ends_at: new Date(Date.now() - 86400000).toISOString() } as Subscription; // -1 day
      assert.strictEqual(getTrialDaysLeft(sub), 0);
    });

    test('returns correct positive days for future trial end', () => {
      const sub = { status: 'trialing', trial_ends_at: new Date(Date.now() + 2 * 86400000).toISOString() } as Subscription; // +2 days
      assert.strictEqual(getTrialDaysLeft(sub), 2);
    });

    test('rounds up to nearest day', () => {
      // 1.5 days should return 2
      const sub = { status: 'trialing', trial_ends_at: new Date(Date.now() + 1.5 * 86400000).toISOString() } as Subscription;
      assert.strictEqual(getTrialDaysLeft(sub), 2);
    });
  });

  describe('getPlanDisplayName', () => {
    test('returns correct display name for known plans', () => {
      assert.strictEqual(getPlanDisplayName('trial'), 'Prueba Gratuita');
      assert.strictEqual(getPlanDisplayName('basico'), 'Básico');
      assert.strictEqual(getPlanDisplayName('pro'), 'Pro');
      assert.strictEqual(getPlanDisplayName('premium'), 'Premium');
    });

    test('returns fallback for unknown plans', () => {
      assert.strictEqual(getPlanDisplayName('enterprise'), 'enterprise');
    });
  });

  describe('getPlanPrice', () => {
    test('returns correct monthly price', () => {
      assert.strictEqual(getPlanPrice('basico', 'monthly'), 79);
      assert.strictEqual(getPlanPrice('pro', 'monthly'), 149);
      assert.strictEqual(getPlanPrice('premium', 'monthly'), 249);
    });

    test('returns correct annual price calculated to monthly', () => {
      // 660 / 12 = 55
      assert.strictEqual(getPlanPrice('basico', 'annual'), 55);
      // 1448 / 12 = 120.666... -> 120.67
      assert.strictEqual(getPlanPrice('pro', 'annual'), 120.67);
      // 2484 / 12 = 207
      assert.strictEqual(getPlanPrice('premium', 'annual'), 207);
    });

    test('returns 0 for unknown plan', () => {
      assert.strictEqual(getPlanPrice('unknown', 'monthly'), 0);
      assert.strictEqual(getPlanPrice('unknown', 'annual'), 0);
    });
  });

  describe('isSubscriptionActive', () => {
    test('returns false for null subscription', () => {
      assert.ok(!isSubscriptionActive(null));
    });

    test('returns true for trialing status', () => {
      const sub = { status: 'trialing' } as Subscription;
      assert.ok(isSubscriptionActive(sub));
    });

    test('returns true for active status', () => {
      const sub = { status: 'active' } as Subscription;
      assert.ok(isSubscriptionActive(sub));
    });

    test('returns false for canceled status', () => {
      const sub = { status: 'canceled' } as Subscription;
      assert.ok(!isSubscriptionActive(sub));
    });

    test('returns false for past_due status', () => {
      const sub = { status: 'past_due' } as Subscription;
      assert.ok(!isSubscriptionActive(sub));
    });
  });
});
