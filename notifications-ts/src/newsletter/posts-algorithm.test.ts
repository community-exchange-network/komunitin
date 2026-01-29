
import assert from 'node:assert';
import { describe, test } from 'node:test';
import { getDistance, Item, selectBestItems } from './posts-algorithm';
import { HistoryLog } from './types';
import { Member } from '../clients/komunitin/types';
import { SeededRandom } from '../utils/seededRandom';

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
    description: 'desc',
    code: `member-${id}`,
    created: new Date().toISOString()    
  },
  relationships: {
    account: { data: { type: 'accounts', id: `account-${id}` } }
  }
});

const createItem = (id: string, authorId: string, created: string, category?: string): Item => ({
  id,
  attributes: {
    name: `Item ${id}`,
    content: 'desc',
    created,
    updated: created,
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
    const closeMember = createMember('close', 0.001, 0.001); // Very close (~150m)
    const farMember = createMember('far', 1, 1); // Very Far (d >> 100km)

    const items = [
      createItem('i1', 'close', new Date().toISOString()),
      createItem('i2', 'far', new Date().toISOString())
    ];

    const members = new Map([
      ['close', closeMember],
      ['far', farMember]
    ]);

    // Run multiple times to verify probability favors i1
    // With new scoring: close has score ~1.0, far has score ~0.5 (due to time component)
    // Expected ratio: ~66%
    let closeCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = new SeededRandom(1000 + i); // Fixed seed per iteration
      const result = selectBestItems({
        targetMember: target,
        items,
        members,
        history: [],
        globalFeaturedIndex: new Map(),
        rng
      }, { freshCount: 1, randomCount: 0 });

      if (result[0]?.id === 'i1') closeCount++;
    }

    assert.ok(closeCount > 60, `Close item selected ${closeCount}/100 times (should be ~66%)`);
  });

  test('selectBestItems treats distance < 1km as flat (equal probability)', () => {
    const target = createMember('target', 0, 0);
    const m1 = createMember('m1', 0.005, 0.005); // ~800m < 1000m
    const m2 = createMember('m2', 0.008, 0.008); // ~1200m < 1000m (still very close)

    // Both should have score 1.0 for distance component (within threshold)
    // So probability should be roughly 50/50

    const items = [
      createItem('i1', 'm1', new Date().toISOString()),
      createItem('i2', 'm2', new Date().toISOString())
    ];

    const members = new Map([['m1', m1], ['m2', m2]]);

    let i1Count = 0;
    for (let i = 0; i < 1000; i++) {
      const rng = new SeededRandom(2000 + i);
      const result = selectBestItems({
        targetMember: target,
        items,
        members,
        history: [],
        globalFeaturedIndex: new Map(),
        rng
      }, { freshCount: 1, randomCount: 0 });
      if (result[0]?.id === 'i1') i1Count++;
    }

    // Allow variance, but should be close to 500
    assert.ok(i1Count > 400 && i1Count < 600, `Items within 1km threshold should be treated equally (i1 count: ${i1Count})`);
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
      const rng = new SeededRandom(3000 + i);
      const result = selectBestItems({
        targetMember: target,
        items: allItems,
        members,
        history,
        globalFeaturedIndex: new Map(),
        rng
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

    const rng = new SeededRandom(4000);
    const result = selectBestItems({
      targetMember: target,
      items,
      members,
      history: [],
      globalFeaturedIndex: new Map(),
      rng
    }, { freshCount: 2, randomCount: 1 });

    assert.strictEqual(result.length, 2, 'Should return 2 items (fallback)');
    // Both should be from the old items list
  });

  test('Penalties can outweigh proximity (Base Score check)', () => {
    // Neighbor (d=0) but penalized heavily (featured recently)
    // Stranger (d=2000 > 1km) but fresh
    // With new scoring: neighbor gets scoreDistance=1.0 but historic penalty 0.5^3 = 0.125
    // Stranger gets scoreDistance based on half-life (10km), so at 2km: exp(-ln(2) * 1/10) ≈ 0.933
    // Stranger's total score (0.5 * 0.933 + 0.5 * 1.0) = 0.967 should beat neighbor's 0.5 * 0.125 = 0.0625

    const target = createMember('target', 0, 0);
    const neighbor = createMember('neighbor', 0, 0); // d=0 < 1km
    const stranger = createMember('stranger', 0.018, 0.018); // d ~ 2.8km > 1km

    const items = [
      createItem('neighborItem', 'neighbor', new Date().toISOString()),
      createItem('strangerItem', 'stranger', new Date().toISOString())
    ];

    const members = new Map([
      ['neighbor', neighbor],
      ['stranger', stranger]
    ]);

    // History: neighbor featured last time (m=1 -> factor 0.5^3 = 0.125)
    const history: HistoryLog[] = [
      { 
        sentAt: new Date(Date.now() - 86400000).toISOString(),
        content: { bestOffers: ['neighborItem'] } 
      } as any
    ];

    let strangerCount = 0;

    for (let i = 0; i < 100; i++) {
      const rng = new SeededRandom(5000 + i);
      const result = selectBestItems({
        targetMember: target,
        items,
        members,
        history,
        globalFeaturedIndex: new Map(),
        rng
      }, { freshCount: 1, randomCount: 0 });

      if (result[0]?.id === 'strangerItem') strangerCount++;
    }

    assert.ok(strangerCount > 80, `Stranger selected ${strangerCount}/100 times (should beat penalized neighbor)`);
  });

  test('Random selection with category conflict retry', () => {
    // Test the retry logic when random items share category with selected items
    const target = createMember('target', 0, 0);
    const m1 = createMember('m1', 0.01, 0.01);
    const m2 = createMember('m2', 0.01, 0.01);
    const m3 = createMember('m3', 0.01, 0.01);

    // Create items with categories - item1 will likely be selected first
    const items = [
      createItem('item1', 'm1', new Date().toISOString(), 'cat1'),
      createItem('item2', 'm2', new Date().toISOString(), 'cat1'), // Same category
      createItem('item3', 'm3', new Date().toISOString(), 'cat2')  // Different category
    ];

    const members = new Map([
      ['m1', m1],
      ['m2', m2],
      ['m3', m3]
    ]);

    // Select 2 items total (1 fresh, 1 random)
    // The random picker should prefer item3 over item2 due to category conflict retry
    let item3SelectedCount = 0;

    for (let i = 0; i < 100; i++) {
      const rng = new SeededRandom(6000 + i);
      const result = selectBestItems({
        targetMember: target,
        items,
        members,
        history: [],
        globalFeaturedIndex: new Map(),
        rng
      }, { freshCount: 1, randomCount: 1 });

      if (result.length === 2 && result.some(item => item.id === 'item3')) {
        item3SelectedCount++;
      }
    }

    // item3 should be selected more often than item2 due to conflict retry logic
    assert.ok(item3SelectedCount > 40, `Item with different category selected ${item3SelectedCount}/100 times`);
  });

  test('selectBestItems prefers items with images (Quality Score)', () => {
    const target = createMember('target', 0, 0);
    const m1 = createMember('m1', 1, 1); // Far away (~157km)
    const m2 = createMember('m2', 1, 1); // Same distance, far away

    // Create items with same distance (far) and old, but different image status
    // Using old dates so time score is low, making quality more significant
    const oldDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(); // 2 years ago
    
    const itemWithImages = createItem('withImages', 'm1', oldDate);
    itemWithImages.attributes.images = ['image1.jpg'];
    
    const itemWithoutImages = createItem('withoutImages', 'm2', oldDate);
    itemWithoutImages.attributes.images = [];

    const items = [itemWithImages, itemWithoutImages];

    const members = new Map([
      ['m1', m1],
      ['m2', m2]
    ]);

    // Run multiple times to verify probability favors item with images
    // Both items: far (low distance score) + old (low time score)
    // Quality becomes a key differentiator: 1.0 vs 0.5
    let withImagesCount = 0;
    
    // Debug: run once to see actual scores
    const debugRng = new SeededRandom(7000);
    const debugResult = selectBestItems({
      targetMember: target,
      items,
      members,
      history: [],
      globalFeaturedIndex: new Map(),
      rng: debugRng
    }, { freshCount: 2, randomCount: 0 }); // Get both to see scores
    
    console.log('Debug - items selected:', debugResult.map(i => i.id));
    
    for (let i = 0; i < 100; i++) {
      const rng = new SeededRandom(7000 + i);
      const result = selectBestItems({
        targetMember: target,
        items,
        members,
        history: [],
        globalFeaturedIndex: new Map(),
        rng
      }, { freshCount: 1, randomCount: 0 });

      if (result[0]?.id === 'withImages') withImagesCount++;
    }

    // With items 2 years old and ~157km away, distance and time scores are near zero
    // Quality becomes the primary differentiator (0.1 weight):
    // scoreWith ≈ 0.1*1.0 = 0.1, scoreWithout ≈ 0.1*0.33 = 0.033
    // Probability = 0.1/(0.1+0.033) = 75.2%
    assert.ok(withImagesCount > 70, `Item with images selected ${withImagesCount}/100 times (quality provides advantage when items are old and far)`);
  });
});
