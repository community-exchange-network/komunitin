
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { shouldSendNewsletter } from './frequency';

describe('Frequency Logic', () => {
  const now = new Date('2025-01-15T12:00:00Z'); // Wednesday

  test('daily', () => {
    // Sent today -> false
    assert.strictEqual(shouldSendNewsletter('daily', new Date('2025-01-15T08:00:00Z'), now), false);
    // Sent yesterday -> true
    assert.strictEqual(shouldSendNewsletter('daily', new Date('2025-01-14T08:00:00Z'), now), true);
  });

  test('weekly', () => {
    // Sent same week (Monday) -> false
    assert.strictEqual(shouldSendNewsletter('weekly', new Date('2025-01-13T08:00:00Z'), now), false);
    // Sent previous week -> true
    assert.strictEqual(shouldSendNewsletter('weekly', new Date('2025-01-08T08:00:00Z'), now), true);
  });

  test('monthly', () => {
    // Sent same month -> false
    assert.strictEqual(shouldSendNewsletter('monthly', new Date('2025-01-01T08:00:00Z'), now), false);
    // Sent previous month -> true
    assert.strictEqual(shouldSendNewsletter('monthly', new Date('2024-12-31T08:00:00Z'), now), true);
  });

  test('quarterly', () => {
    // Sent same quarter (Jan) -> false
    assert.strictEqual(shouldSendNewsletter('quarterly', new Date('2025-01-01T08:00:00Z'), now), false);
    // Sent previous quarter (Dec) -> true
    assert.strictEqual(shouldSendNewsletter('quarterly', new Date('2024-12-31T08:00:00Z'), now), true);
  });
});
