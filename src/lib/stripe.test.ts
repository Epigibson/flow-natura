import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { getPriceId, getPlanFromPriceId } from './stripe.ts';

describe('Stripe Utility Functions', () => {
  const originalEnv = process.env;

  before(() => {
    process.env = {
      ...originalEnv,
      STRIPE_PRICE_BASICO_MONTHLY: 'price_basico_m',
      STRIPE_PRICE_BASICO_ANNUAL: 'price_basico_a',
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
      STRIPE_PRICE_PRO_ANNUAL: 'price_pro_a',
      STRIPE_PRICE_PREMIUM_MONTHLY: 'price_premium_m',
      STRIPE_PRICE_PREMIUM_ANNUAL: 'price_premium_a',
    };
  });

  after(() => {
    process.env = originalEnv;
  });

  describe('getPriceId', () => {
    test('returns correct ID for basico monthly', () => {
      assert.strictEqual(getPriceId('basico', 'monthly'), 'price_basico_m');
    });

    test('returns correct ID for pro annual', () => {
      assert.strictEqual(getPriceId('pro', 'annual'), 'price_pro_a');
    });

    test('returns correct ID for premium monthly', () => {
      assert.strictEqual(getPriceId('premium', 'monthly'), 'price_premium_m');
    });

    test('returns empty string for unknown plan', () => {
      assert.strictEqual(getPriceId('unknown', 'monthly'), '');
    });

    test('returns empty string for unknown billing cycle', () => {
      assert.strictEqual(getPriceId('basico', 'daily'), '');
    });
  });

  describe('getPlanFromPriceId', () => {
    test('reverses basico monthly price ID', () => {
      const result = getPlanFromPriceId('price_basico_m');
      assert.deepStrictEqual(result, { plan: 'basico', billing: 'monthly' });
    });

    test('reverses pro annual price ID', () => {
      const result = getPlanFromPriceId('price_pro_a');
      assert.deepStrictEqual(result, { plan: 'pro', billing: 'annual' });
    });

    test('reverses premium monthly price ID', () => {
      const result = getPlanFromPriceId('price_premium_m');
      assert.deepStrictEqual(result, { plan: 'premium', billing: 'monthly' });
    });

    test('returns unknown for unrecognized price ID', () => {
      const result = getPlanFromPriceId('price_unknown');
      assert.deepStrictEqual(result, { plan: 'unknown', billing: 'monthly' });
    });
  });

  test('round-trip mapping for all plans and billing cycles', () => {
    const plans = ['basico', 'pro', 'premium'];
    const billings = ['monthly', 'annual'];

    for (const plan of plans) {
      for (const billing of billings) {
        const id = getPriceId(plan, billing);
        assert.ok(id, `Should have a price ID for ${plan} ${billing}`);
        const reversed = getPlanFromPriceId(id);
        assert.deepStrictEqual(reversed, { plan, billing }, `Round-trip failed for ${plan} ${billing}`);
      }
    }
  });
});
