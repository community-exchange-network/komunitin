
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { selectBestItems, getDistance, Item } from './posts-algorithm';
import { Member, LogContent, HistoryLog } from './types';

// Helpers
const createMember = (id: string, lat?: number, lon?: number): Member => ({
  id,
  attributes: {
    location: (lat !== undefined && lon !== undefined) ? {
      type: 'Point',
      coordinates: [lon, lat]
    } : undefined,
    name: `Member ${id}`,
    image: 'img',
    description: 'desc'
  }
});

const createItem = (id: string, authorId: string, created: string, category?: string): Item => ({
  id,
  attributes: {
    name: `Item ${id}`,
    content: 'desc',
    created,
    expires: '2099-01-01',
    images: [],
    code: id
  },
  relationships: {
    member: { data: { id: authorId } },
    category: category ? { data: { id: category } } : undefined
  }
} as any);

describe('Feedback Algorithm', () => {

  test('getDistance calculates crude distance', () => {
    const m1 = createMember('1', 41.38, 2.17); // Barcelona
    const m2 = createMember('2', 40.41, -3.70); // Madrid ~500km
    const d = getDistance(m1, m2);
    // d is in meters. 500km = 500,000m.
    assert.ok(d > 400000 && d < 600000, `Distance ${d} should be around 500km`);
  });

  test('selectBestItems prefers closer members (Distance Score)', () => {
    const target = createMember('target', 0, 0);
    const closeMember = createMember('close', 0.01, 0.01); // Very close
    const farMember = createMember('far', 20, 20); // Very Far (d >> K)

    const items = [
      createItem('i1', 'close', new Date().toISOString()),
      createItem('i2', 'far', new Date().toISOString())
    ];

    const members = new Map([
      ['close', closeMember],
      ['far', farMember]
    ]);

    // Run multiple times to verify probability favors i1
    let closeCount = 0;
    for (let i = 0; i < 100; i++) {
      const result = selectBestItems({
        targetMember: target,
        items,
        members,
        history: [],
        globalFeaturedIndex: new Map()
      }, { freshCount: 1, randomCount: 0 });

      if (result[0]?.id === 'i1') closeCount++;
    }

    assert.ok(closeCount > 70, `Close item selected ${closeCount}/100 times`);
  });

  test('selectBestItems treats distance < K as flat (equal probability)', () => {
    const target = createMember('target', 0, 0);
    const m1 = createMember('m1', 1, 1); // ~150km < 1000
    const m2 = createMember('m2', 2, 2); // ~300km < 1000

    // Both should have score 1.0 (before ALPHA mix, actually 1.0 total)
    // So probability should be roughly 50/50

    const items = [
      createItem('i1', 'm1', new Date().toISOString()),
      createItem('i2', 'm2', new Date().toISOString())
    ];

    const members = new Map([['m1', m1], ['m2', m2]]);

    let i1Count = 0;
    for (let i = 0; i < 1000; i++) {
      const result = selectBestItems({
        targetMember: target,
        items,
        members,
        history: [],
        globalFeaturedIndex: new Map()
      }, { freshCount: 1, randomCount: 0 });
      if (result[0]?.id === 'i1') i1Count++;
    }

    // Allow variance, but should be close to 500
    assert.ok(i1Count > 400 && i1Count < 600, `Items within K should be treated equally (i1 count: ${i1Count})`);
  });

  test('selectBestItems applies History Penalty', () => {
    const target = createMember('target', 0, 0);
    const m1 = createMember('m1', 1, 1);
    const m2 = createMember('m2', 1, 1); // Same distance

    const items = [
      createItem('item1', 'm1', new Date().toISOString()),
      createItem('item2', 'm2', new Date().toISOString())
    ];

    const members = new Map([['m1', m1], ['m2', m2]]);

    // History: m1 was featured recently (penalty applies)
    const history: HistoryLog[] = [
      { 
        sentAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        content: { bestOffers: ['old-item-from-m1'] } 
      } as any
    ];

    const oldItem = createItem('old-item-from-m1', 'm1', '2024-01-01');
    const allItems = [...items, oldItem];

    let m2Count = 0;
    for (let i = 0; i < 100; i++) {
      const result = selectBestItems({
        targetMember: target,
        items: allItems,
        members,
        history,
        globalFeaturedIndex: new Map()
      }, { freshCount: 1, randomCount: 0 });

      if (result[0]?.id === 'item2') m2Count++;
    }

    assert.ok(m2Count > 60, `Non-penalized member item selected ${m2Count}/100 times`);
  });

  test('Fallback to random if no fresh items', () => {
    const target = createMember('target', 0, 0);
    const items = [
      createItem('old1', 'm1', '2020-01-01'),
      createItem('old2', 'm2', '2020-01-01')
    ];
    const members = new Map([
      ['m1', createMember('m1')],
      ['m2', createMember('m2')]
    ]);

    const result = selectBestItems({
      targetMember: target,
      items,
      members,
      history: [],
      globalFeaturedIndex: new Map()
    }, { freshCount: 2, randomCount: 1 });

    assert.strictEqual(result.length, 2, 'Should return 2 items (fallback)');
    // Both should be from the old items list
  });

  test('Penalties can outweigh proximity (Base Score check)', () => {
    // Neighbor (d=0) but penalized heavily (featured recently)
    // Stranger (d=2000 > K=1000) but fresh
    // With pure exp(), stranger score ~ 0, so neighbor wins.
    // With base score, stranger score ~ 0.2. Neighbor score 1.0 * 0.125 = 0.125. Stranger should win.

    const target = createMember('target', 0, 0);
    const neighbor = createMember('neighbor', 0, 0); // d=0 < 1000
    const stranger = createMember('stranger', 0.02, 0.02); // d ~ 3km > 1000

    const items = [
      createItem('neighborItem', 'neighbor', new Date().toISOString()),
      createItem('strangerItem', 'stranger', new Date().toISOString())
    ];

    const members = new Map([
      ['neighbor', neighbor],
      ['stranger', stranger]
    ]);

    // History: neighbor featured last time (m=1 -> factor 0.125)
    // Add neighborItem to history
    // Since we check if AUTHOR was featured, we need to trace author.
    // We can use a dummy item id that maps to neighbor in the items list, 
    // BUT our logic looks up valid items. 'neighborItem' is valid.
    const history: HistoryLog[] = [
      { 
        sentAt: new Date(Date.now() - 86400000).toISOString(),
        content: { bestOffers: ['neighborItem'] } 
      } as any
    ];

    let strangerCount = 0;

    for (let i = 0; i < 100; i++) {
      const result = selectBestItems({
        targetMember: target,
        items,
        members,
        history,
        globalFeaturedIndex: new Map()
      }, { freshCount: 1, randomCount: 0 });

      if (result[0]?.id === 'strangerItem') strangerCount++;
    }

    assert.ok(strangerCount > 50, `Stranger selected ${strangerCount}/100 times (should beat penalized neighbor)`);
  });
});
