import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getLevelBySales,
  calculateConsultantPrice,
  getProgressToNextLevel,
  CAMINO_CRECIMIENTO
} from './camino-crecimiento.ts';

describe('Camino de Crecimiento', () => {
  describe('getLevelBySales', () => {
    test('returns Bronce for sales below 4801', () => {
      assert.strictEqual(getLevelBySales(0).level, 'Bronce');
      assert.strictEqual(getLevelBySales(4800).level, 'Bronce');
    });

    test('returns Plata for sales between 4801 and 16000', () => {
      assert.strictEqual(getLevelBySales(4801).level, 'Plata');
      assert.strictEqual(getLevelBySales(16000).level, 'Plata');
    });

    test('returns Oro for sales between 16001 and 80000', () => {
      assert.strictEqual(getLevelBySales(16001).level, 'Oro');
      assert.strictEqual(getLevelBySales(80000).level, 'Oro');
    });

    test('returns Zafiro for sales between 80001 and 350000', () => {
      assert.strictEqual(getLevelBySales(80001).level, 'Zafiro');
      assert.strictEqual(getLevelBySales(350000).level, 'Zafiro');
    });

    test('returns Diamante for sales 350001 and above', () => {
      assert.strictEqual(getLevelBySales(350001).level, 'Diamante');
      assert.strictEqual(getLevelBySales(1000000).level, 'Diamante');
    });
  });

  describe('calculateConsultantPrice', () => {
    test('calculates correct price and rounds properly', () => {
      // Bronce factor is 0.7845
      // 100 * 0.7845 = 78.45
      assert.strictEqual(calculateConsultantPrice(100, 'Bronce'), 78.45);

      // Plata factor is 0.7414
      // 100 * 0.7414 = 74.14
      assert.strictEqual(calculateConsultantPrice(100, 'Plata'), 74.14);

      // Oro factor is 0.6983
      // 99 * 0.6983 = 69.1317 -> 69.13
      assert.strictEqual(calculateConsultantPrice(99, 'Oro'), 69.13);

      // Zafiro factor is 0.6811
      // 99 * 0.6811 = 67.4289 -> 67.43
      assert.strictEqual(calculateConsultantPrice(99, 'Zafiro'), 67.43);

      // Diamante factor is 0.6552
      // 99 * 0.6552 = 64.8648 -> 64.86
      assert.strictEqual(calculateConsultantPrice(99, 'Diamante'), 64.86);
    });
  });

  describe('getProgressToNextLevel', () => {
    test('clamps negative sales to 0%', () => {
      const result = getProgressToNextLevel(-1000);
      assert.strictEqual(result.percentage, 0);
      assert.strictEqual(result.missingAmount, 5800);
      assert.strictEqual(result.nextLevel, 'Plata');
    });

    test('calculates exactly at min bounds (0% progress)', () => {
      const result = getProgressToNextLevel(4801); // Plata min
      assert.strictEqual(result.percentage, 0);
      assert.strictEqual(result.missingAmount, 16000 - 4801);
      assert.strictEqual(result.nextLevel, 'Oro');
    });

    test('calculates exactly at max bounds (100% progress)', () => {
      const result = getProgressToNextLevel(4800); // Bronce max
      assert.strictEqual(result.percentage, 100);
      assert.strictEqual(result.missingAmount, 0);
      assert.strictEqual(result.nextLevel, 'Plata');
    });

    test('calculates progress at midpoint', () => {
      const result = getProgressToNextLevel(2400); // Bronce mid
      assert.strictEqual(result.percentage, 50);
      assert.strictEqual(result.missingAmount, 2400);
      assert.strictEqual(result.nextLevel, 'Plata');
    });

    test('returns 100% and nulls for Diamante', () => {
      const result = getProgressToNextLevel(350001); // Diamante
      assert.strictEqual(result.percentage, 100);
      assert.strictEqual(result.missingAmount, null);
      assert.strictEqual(result.nextLevel, null);
    });
  });
});
