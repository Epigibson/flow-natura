import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { getTrialDaysLeft, type Subscription } from './subscription.ts';

describe('Subscription Utility Functions', () => {
  describe('getTrialDaysLeft', () => {
    let originalDateNow: () => number;

    before(() => {
      originalDateNow = Date.now;
    });

    after(() => {
      Date.now = originalDateNow;
    });

    const createSub = (trial_ends_at: string | null): Subscription => ({
      id: 'sub_123',
      consultant_id: 'user_123',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      plan: 'trial',
      billing_period: 'monthly',
      status: 'trialing',
      trial_ends_at,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    test('returns 0 when subscription is null', () => {
      assert.strictEqual(getTrialDaysLeft(null), 0);
    });

    test('returns 0 when trial_ends_at is null', () => {
      assert.strictEqual(getTrialDaysLeft(createSub(null)), 0);
    });

    test('returns 0 when trial ends in the past', () => {
      const now = new Date('2024-01-10T12:00:00Z').getTime();
      Date.now = () => now;
      assert.strictEqual(getTrialDaysLeft(createSub('2024-01-09T12:00:00Z')), 0);
    });

    test('returns 0 when trial ends exactly now', () => {
      const now = new Date('2024-01-10T12:00:00Z').getTime();
      Date.now = () => now;
      assert.strictEqual(getTrialDaysLeft(createSub('2024-01-10T12:00:00Z')), 0);
    });

    test('returns 1 when trial ends in less than 24 hours', () => {
      const now = new Date('2024-01-10T12:00:00Z').getTime();
      Date.now = () => now;
      // 12 hours from now
      assert.strictEqual(getTrialDaysLeft(createSub('2024-01-11T00:00:00Z')), 1);
    });

    test('returns 2 when trial ends in exactly 24 hours plus 1 second (ceil behavior)', () => {
      const now = new Date('2024-01-10T12:00:00Z').getTime();
      Date.now = () => now;
      // 24 hours + 1 second
      assert.strictEqual(getTrialDaysLeft(createSub('2024-01-11T12:00:01Z')), 2);
    });

    test('returns exact days when trial ends exactly on day boundaries', () => {
      const now = new Date('2024-01-10T12:00:00Z').getTime();
      Date.now = () => now;
      // Exactly 3 days
      assert.strictEqual(getTrialDaysLeft(createSub('2024-01-13T12:00:00Z')), 3);
    });
  });
});
