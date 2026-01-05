
import { test, describe, afterEach, it } from 'node:test';
import assert from 'node:assert';
import { shouldSendNewsletter, shouldProcessGroup } from './frequency';
import { Group } from '../clients/komunitin/types';
import { mockDate, restoreDate } from '../mocks/date';

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

describe('shouldProcessGroup', () => {
  afterEach(() => {
    restoreDate();
  });

  const createGroup = (coordinates?: [number, number]): Group => ({
    id: '1',
    attributes: {
      code: 'TEST',
      name: 'Test Group',
      status: 'active',
      location: {
        type: 'Point',
        coordinates: coordinates || [0, 0]
      }
    }
  });

  it('should always return true if isManualRun is true', () => {
    const group = createGroup();
    assert.strictEqual(shouldProcessGroup(group, true), true);
  });

  it('should return true for UTC group on Sunday 15:30 UTC', () => {
    // Sunday, Jan 4 2026 is a Sunday. 15:30 UTC
    mockDate('2026-01-04T15:30:00Z');
    
    // [0, 0] is in Atlantic/Reykjavik or similar which is UTC usually, or just handled as UTC by our fallback
    const group = createGroup([0, 0]); 
    
    assert.strictEqual(shouldProcessGroup(group, false), true);
  });

  it('should return false for UTC group on Sunday 14:30 UTC', () => {
    mockDate('2026-01-04T14:30:00Z');
    const group = createGroup([0, 0]);
    assert.strictEqual(shouldProcessGroup(group, false), false);
  });

  it('should return false for UTC group on Monday 15:30 UTC', () => {
    mockDate('2026-01-05T15:30:00Z');
    const group = createGroup([0, 0]);
    assert.strictEqual(shouldProcessGroup(group, false), false);
  });

  it('should return true for Madrid group (UTC+1) on Sunday 15:30 Local (14:30 UTC)', () => {
    // Madrid is UTC+1 in Winter. 15:30 Local = 14:30 UTC
    mockDate('2026-01-04T14:30:00Z');
    
    // Madrid coordinates approx
    const group = createGroup([-3.7038, 40.4168]); 
    
    assert.strictEqual(shouldProcessGroup(group, false), true);
  });

  it('should return false for Madrid group (UTC+1) on Sunday 16:30 Local (15:30 UTC)', () => {
    // 15:30 UTC is 16:30 Madrid time
    mockDate('2026-01-04T15:30:00Z');
    const group = createGroup([-3.7038, 40.4168]);
    
    assert.strictEqual(shouldProcessGroup(group, false), false);
  });

  it('should return true for New York group (UTC-5) on Sunday 15:30 Local (20:30 UTC)', () => {
    // NY is UTC-5 in Winter. 15:30 Local = 20:30 UTC
    mockDate('2026-01-04T20:30:00Z');
    
    // NY coordinates
    const group = createGroup([-74.006, 40.7128]);
    
    assert.strictEqual(shouldProcessGroup(group, false), true);
  });

  it('should handle invalid coordinates by defaulting to UTC', () => {
    // Sunday 15:30 UTC
    mockDate('2026-01-04T15:30:00Z');
    
    const group = createGroup();
    group.attributes.location.coordinates = [] as any; // Invalid
    
    assert.strictEqual(shouldProcessGroup(group, false), true);
  });
});