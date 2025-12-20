import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SeededRandom, stringToSeed } from './seededRandom';

describe('SeededRandom', () => {
  test('should produce same sequence with same seed', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);

    const sequence1 = Array.from({ length: 10 }, () => rng1.random());
    const sequence2 = Array.from({ length: 10 }, () => rng2.random());

    assert.deepStrictEqual(sequence1, sequence2, 'Same seed should produce identical sequences');
  });

  test('should produce different sequences with different seeds', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(54321);

    const sequence1 = Array.from({ length: 10 }, () => rng1.random());
    const sequence2 = Array.from({ length: 10 }, () => rng2.random());

    assert.notDeepStrictEqual(sequence1, sequence2, 'Different seeds should produce different sequences');
  });

  test('should generate numbers between 0 and 1', () => {
    const rng = new SeededRandom(42);

    for (let i = 0; i < 100; i++) {
      const num = rng.random();
      assert.ok(num >= 0 && num < 1, `Random number ${num} should be in [0, 1)`);
    }
  });

  test('randomInt should generate integers in range', () => {
    const rng = new SeededRandom(42);

    for (let i = 0; i < 100; i++) {
      const num = rng.randomInt(5, 10);
      assert.ok(Number.isInteger(num), 'Should generate integer');
      assert.ok(num >= 5 && num < 10, `Random int ${num} should be in [5, 10)`);
    }
  });

  test('stringToSeed should produce consistent seeds from strings', () => {
    const seed1a = stringToSeed('test-string-123');
    const seed1b = stringToSeed('test-string-123');
    const seed2 = stringToSeed('different-string');

    assert.strictEqual(seed1a, seed1b, 'Same string should produce same seed');
    assert.notStrictEqual(seed1a, seed2, 'Different strings should produce different seeds');
  });

  test('stringToSeed should handle UUIDs', () => {
    const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
    const uuid2 = '550e8400-e29b-41d4-a716-446655440001';

    const seed1 = stringToSeed(uuid1);
    const seed2 = stringToSeed(uuid2);

    assert.ok(typeof seed1 === 'number', 'Should produce numeric seed');
    assert.ok(seed1 > 0, 'Seed should be positive');
    assert.notStrictEqual(seed1, seed2, 'Different UUIDs should produce different seeds');
  });

  test('reproducibility over multiple runs', () => {
    // Simulate multiple runs with the same seed
    const results: number[][] = [];
    
    for (let run = 0; run < 3; run++) {
      const rng = new SeededRandom(999);
      const sequence = Array.from({ length: 5 }, () => rng.random());
      results.push(sequence);
    }

    // All runs should produce identical results
    assert.deepStrictEqual(results[0], results[1], 'Run 1 and 2 should match');
    assert.deepStrictEqual(results[1], results[2], 'Run 2 and 3 should match');
  });
});
