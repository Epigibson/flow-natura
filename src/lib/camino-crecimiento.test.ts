import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getLevelBySales,
  calculateConsultantPrice,
  getProgressToNextLevel,
  CAMINO_CRECIMIENTO
} from './camino-crecimiento.ts';

describe('Camino de Crecimiento Logic', () => {

  describe('getLevelBySales', () => {
    test('returns Bronce for sales below 4800', () => {
      assert.strictEqual(getLevelBySales(0).level, 'Bronce');
      assert.strictEqual(getLevelBySales(2000).level, 'Bronce');
    });

    test('returns Bronce at exact boundary 4800', () => {
      assert.strictEqual(getLevelBySales(4800).level, 'Bronce');
    });

    test('returns Plata for sales just above 4800', () => {
      assert.strictEqual(getLevelBySales(4801).level, 'Plata');
      assert.strictEqual(getLevelBySales(10000).level, 'Plata');
    });

    test('returns Plata at exact boundary 16000', () => {
      assert.strictEqual(getLevelBySales(16000).level, 'Plata');
    });

    test('returns Oro for sales just above 16000', () => {
      assert.strictEqual(getLevelBySales(16001).level, 'Oro');
      assert.strictEqual(getLevelBySales(50000).level, 'Oro');
    });

    test('returns Oro at exact boundary 80000', () => {
      assert.strictEqual(getLevelBySales(80000).level, 'Oro');
    });

    test('returns Zafiro for sales just above 80000', () => {
      assert.strictEqual(getLevelBySales(80001).level, 'Zafiro');
      assert.strictEqual(getLevelBySales(200000).level, 'Zafiro');
    });

    test('returns Zafiro at exact boundary 350000', () => {
      assert.strictEqual(getLevelBySales(350000).level, 'Zafiro');
    });

    test('returns Diamante for sales above 350000', () => {
      assert.strictEqual(getLevelBySales(350001).level, 'Diamante');
      assert.strictEqual(getLevelBySales(1000000).level, 'Diamante');
    });
  });

  describe('calculateConsultantPrice', () => {
    test('calculates correct price for Bronce', () => {
      // Bronce factor is 0.7845
      // 100 * 0.7845 = 78.45
      assert.strictEqual(calculateConsultantPrice(100, 'Bronce'), 78.45);
    });

    test('calculates correct price for Plata', () => {
      // Plata factor is 0.7414
      // 100 * 0.7414 = 74.14
      assert.strictEqual(calculateConsultantPrice(100, 'Plata'), 74.14);
    });

    test('calculates correct price for Oro', () => {
      // Oro factor is 0.6983
      // 100 * 0.6983 = 69.83
      assert.strictEqual(calculateConsultantPrice(100, 'Oro'), 69.83);
    });

    test('calculates correct price for Zafiro', () => {
      // Zafiro factor is 0.6811
      // 100 * 0.6811 = 68.11
      assert.strictEqual(calculateConsultantPrice(100, 'Zafiro'), 68.11);
    });

    test('calculates correct price for Diamante', () => {
      // Diamante factor is 0.6552
      // 100 * 0.6552 = 65.52
      assert.strictEqual(calculateConsultantPrice(100, 'Diamante'), 65.52);
    });

    test('rounds correctly to 2 decimal places', () => {
      // Bronce factor is 0.7845
      // 45.99 * 0.7845 = 36.079155 -> rounds to 36.08
      assert.strictEqual(calculateConsultantPrice(45.99, 'Bronce'), 36.08);

      // Oro factor is 0.6983
      // 25.50 * 0.6983 = 17.80665 -> rounds to 17.81
      assert.strictEqual(calculateConsultantPrice(25.50, 'Oro'), 17.81);
    });
  });

  describe('getProgressToNextLevel', () => {
    test('calculates progress correctly for 0 sales (Bronce)', () => {
      const progress = getProgressToNextLevel(0);
      assert.deepStrictEqual(progress, {
        percentage: 0,
        missingAmount: 4800,
        nextLevel: 'Plata'
      });
    });

    test('calculates progress correctly mid-level (Bronce)', () => {
      const progress = getProgressToNextLevel(2400); // exactly halfway
      assert.deepStrictEqual(progress, {
        percentage: 50,
        missingAmount: 2400,
        nextLevel: 'Plata'
      });
    });

    test('calculates progress correctly near boundary (Bronce)', () => {
      const progress = getProgressToNextLevel(4799); // 1 unit away
      // (4799/4800)*100 = 99.97916... -> rounds to 100
      assert.deepStrictEqual(progress, {
        percentage: 100,
        missingAmount: 1,
        nextLevel: 'Plata'
      });
    });

    test('calculates progress correctly at lower boundary (Plata)', () => {
      const progress = getProgressToNextLevel(4801);
      // min: 4801, max: 16000, range: 11199, current: 0
      assert.deepStrictEqual(progress, {
        percentage: 0,
        missingAmount: 11199,
        nextLevel: 'Oro'
      });
    });

    test('calculates progress correctly mid-level (Plata)', () => {
      const progress = getProgressToNextLevel(10400.5); // exactly halfway
      assert.deepStrictEqual(progress, {
        percentage: 50,
        missingAmount: 5599.5,
        nextLevel: 'Oro'
      });
    });

    test('returns 100% and nulls for Diamante', () => {
      const progress = getProgressToNextLevel(400000);
      assert.deepStrictEqual(progress, {
        percentage: 100,
        missingAmount: null,
        nextLevel: null
      });
    });

    test('handles exactly max boundary correctly before crossing', () => {
        // e.g. exact 4800 which is still Bronce
        const progress = getProgressToNextLevel(4800);
        assert.deepStrictEqual(progress, {
            percentage: 100,
            missingAmount: 0,
            nextLevel: 'Plata'
        });
    });
  });
});
