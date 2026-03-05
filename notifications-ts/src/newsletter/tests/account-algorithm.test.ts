import assert from 'node:assert';
import { describe, test } from 'node:test';
import { getAccountSectionData } from '../account-algorithm';
import { Currency, Member, Need, Offer } from '../../clients/komunitin/types';

// Helpers
const createMember = (attrs: any = {}): Member => ({
  id: 'm1',
  attributes: { 
    image: 'img',
    description: 'bio',
    location: { type: 'Point', coordinates: [0, 0] }, 
    ...attrs 
  },
  relationships: {
    account: { data: { type: 'accounts', id: 'm1-account' } },
    needs: { meta: { count: 0 } },
    offers: { meta: { count: 0 } }
  }
});

const createAccount = (balance: number) => ({
  attributes: { balance }
});

const createCurrency = (): Currency => ({
  id: 'test',
  attributes: {
    code: 'TEST',
    name: 'Test Coin',
    namePlural: 'Test Coins',
    symbol: 'T',
    decimals: 2,
    scale: 0,
    rate: { n: 1, d: 1 }
  }
});

const createTransfer = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { attributes: { created: d.toISOString() } };
};

describe('Account Algorithm', () => {

  test('Balance Advice Logic', () => {
    // > 10
    const d1 = getAccountSectionData({
      member: createMember(),
      account: createAccount(15),
      activeOffers: [], activeNeeds: [], expiredOffers: [], transfers: [], history: [],
      currency: createCurrency()
    });
    assert.strictEqual(d1.balanceAdviceId, "newsletter.balance_advice_positive");

    // < -10
    const d2 = getAccountSectionData({
      member: createMember(),
      account: createAccount(-15),
      activeOffers: [], activeNeeds: [], expiredOffers: [], transfers: [], history: [],
      currency: createCurrency()
    });
    assert.strictEqual(d2.balanceAdviceId, "newsletter.balance_advice_negative");

    // ~ 0
    const d3 = getAccountSectionData({
      member: createMember(),
      account: createAccount(1),
      activeOffers: [], activeNeeds: [], expiredOffers: [], transfers: [], history: [],
      currency: createCurrency()
    });
    assert.strictEqual(d3.balanceAdviceId, "newsletter.balance_advice_balanced");
  });

  test('Alert Priorities', () => {
    // 1. No offers + Negative Balance
    const d1 = getAccountSectionData({
      member: createMember(),
      account: createAccount(-5),
      activeOffers: [], activeNeeds: [], // No offers/needs
      expiredOffers: [], transfers: [], history: [],
      currency: createCurrency()
    });
    assert.strictEqual(d1.alert?.type, 'NO_OFFERS_NEGATIVE', 'Should define priority 1 alert');

    // 2. No needs + Positive (offers exist to skip priority 1/3)
    const offer = { id: 'o1' } as Offer;
    const d2 = getAccountSectionData({
      member: createMember(),
      account: createAccount(5),
      activeOffers: [offer], activeNeeds: [],
      expiredOffers: [], transfers: [], history: [],
      currency: createCurrency()
    });
    assert.strictEqual(d2.alert?.type, 'NO_NEEDS_POSITIVE', 'Should define priority 2 alert');

    // 3. No offers (Balance positive)
    const need = { id: 'n1' } as Need;
    const d3 = getAccountSectionData({
      member: createMember(),
      account: createAccount(5),
      activeOffers: [], activeNeeds: [need],
      expiredOffers: [], transfers: [], history: [],
      currency: createCurrency()
    });
    assert.strictEqual(d3.alert?.type, 'NO_OFFERS', 'Should define priority 3 alert');
  });

  test('History Logic - Skipping Repeated Alerts', () => {
    // Priority 1 alert condition
    const dataBase = {
      member: createMember(),
      account: createAccount(-5),
      activeOffers: [], activeNeeds: [], expiredOffers: [], transfers: [],
      currency: createCurrency()
    };

    // Case: No history. Shows Alert 1.
    const run1 = getAccountSectionData({ ...dataBase, history: [] });
    assert.strictEqual(run1.alert?.type, 'NO_OFFERS_NEGATIVE');


    // Case: History has 1 occurence. Shows Alert 1 (2nd time).
  const log1 = { content: { account: { alert: 'NO_OFFERS_NEGATIVE' } } } as any;
    const run2 = getAccountSectionData({ ...dataBase, history: [log1] });
    assert.strictEqual(run2.alert?.type, 'NO_OFFERS_NEGATIVE');

    // Case: History has 2 occurences. Should Skip Alert 1 and show Alert 3 (No Offers)
    // Why Alert 3?
    // Priority 1: NO_OFFERS_NEGATIVE (Skipped)
    // Priority 2: NO_NEEDS_POSITIVE (Balance < 0, False)
    // Priority 3: NO_OFFERS (True, No active offers)
    const log2 = { content: { account: { alert: 'NO_OFFERS_NEGATIVE' } } } as any;
    const run3 = getAccountSectionData({ ...dataBase, history: [log1, log2] }); // Recent first

    assert.strictEqual(run3.alert?.type, 'NO_OFFERS', 'Should skip priority 1 and fall to priority 3');
  });

  test('Activity Stats', () => {
    // 2 transfers within month
    const t1 = createTransfer(5);
    const t2 = createTransfer(20);
    const t3 = createTransfer(40); // old

    const d = getAccountSectionData({
      member: createMember(),
      account: createAccount(0),
      activeOffers: [{ id: 'o' }] as any, activeNeeds: [{ id: 'n' }] as any,
      expiredOffers: [],
      transfers: [t1, t2, t3],
      history: [],
      currency: createCurrency()
    });

    assert.strictEqual(d.activityCount, 2);
  });

  test('Multiple Alerts - Priority Check', () => {
    // User has NO IMAGE (Priority 5) and EXPIRED OFFERS (Priority 8)
    // Should pick NO IMAGE
    const d = getAccountSectionData({
      member: createMember({ image: null }), // No image
      account: createAccount(0),
      activeOffers: [{ id: 'o1' } as Offer], // Has offers (skips 1, 3)
      activeNeeds: [{ id: 'n1' } as Need],   // Has needs (skips 2, 4)
      expiredOffers: [{ id: 'eo1' } as Offer], // Has expired offers
      transfers: [], history: [],
      currency: createCurrency()
    });

    assert.strictEqual(d.alert?.type, 'NO_IMAGE', 'Should prioritize NO_IMAGE over EXPIRED_OFFERS');
  });

  test('No Alerts', () => {
    // User has everything set up correctly
    const d = getAccountSectionData({
      member: createMember({ 
        image: 'img.jpg', 
        description: 'Bio', 
        location: { type: 'Point', coordinates: [1, 1] } 
      }),
      account: createAccount(0),
      activeOffers: [{ id: 'o1' } as Offer],
      activeNeeds: [{ id: 'n1' } as Need],
      expiredOffers: [],
      transfers: [], history: [],
      currency: createCurrency()
    });

    assert.strictEqual(d.alert, undefined, 'Should have no alerts');
  });

  test('Alert Priority 4: No Needs', () => {
    // Has offers, has needs=false, balance neutral
    const d = getAccountSectionData({
      member: createMember(),
      account: createAccount(0),
      activeOffers: [{ id: 'o1' } as Offer],
      activeNeeds: [], // No needs
      expiredOffers: [],
      transfers: [], history: [],
      currency: createCurrency()
    });

    assert.strictEqual(d.alert?.type, 'NO_NEEDS', 'Should show NO_NEEDS alert');
    assert.strictEqual(d.alert?.actionUrl, '/groups/:code/needs/new');
  });

  test('Alert Priority 6: No Bio', () => {
    const d = getAccountSectionData({
      member: createMember({ description: '' }), // No bio
      account: createAccount(0),
      activeOffers: [{ id: 'o1' } as Offer],
      activeNeeds: [{ id: 'n1' } as Need],
      expiredOffers: [],
      transfers: [], history: [],
      currency: createCurrency()
    });

    assert.strictEqual(d.alert?.type, 'NO_BIO', 'Should show NO_BIO alert');
    assert.strictEqual(d.alert?.actionUrl, '/profile');
  });

  test('Alert Priority 7: No Location', () => {
    const d = getAccountSectionData({
      member: createMember({ location: { type: 'Point', coordinates: [0, 0] } }), // [0,0] means no location
      account: createAccount(0),
      activeOffers: [{ id: 'o1' } as Offer],
      activeNeeds: [{ id: 'n1' } as Need],
      expiredOffers: [],
      transfers: [], history: [],
      currency: createCurrency()
    });

    assert.strictEqual(d.alert?.type, 'NO_LOCATION', 'Should show NO_LOCATION alert');
    assert.strictEqual(d.alert?.actionUrl, '/profile');
  });

  test('Alert Priority 8: Expired Offers with count', () => {
    const d = getAccountSectionData({
      member: createMember({ 
        image: 'img.jpg',
        description: 'Has bio',
        location: { type: 'Point', coordinates: [1, 1] } // Has location
      }),
      account: createAccount(0),
      activeOffers: [{ id: 'o1' } as Offer],
      activeNeeds: [{ id: 'n1' } as Need],
      expiredOffers: [
        { id: 'eo1' } as Offer,
        { id: 'eo2' } as Offer,
        { id: 'eo3' } as Offer
      ],
      transfers: [], history: [],
      currency: createCurrency()
    });

    assert.strictEqual(d.alert?.type, 'EXPIRED_OFFERS', 'Should show EXPIRED_OFFERS alert');
    assert.strictEqual(d.alert?.messageParams?.count, 3, 'Should include count of expired offers');
    assert.strictEqual(d.alert?.actionUrl, '/groups/:code/offers');
  });

  test('Currency conversion with scale', () => {
    // Test balance conversion with scale != 0
    const currencyWithScale = {
      attributes: {
        code: 'TEST',
        name: 'Test Coin',
        namePlural: 'Test Coins',
        symbol: 'T',
        decimals: 2,
        scale: 2, // 100 units = 1 HOUR
        rate: { n: 1, d: 1 }
      }
    };

    // balance = 1500, scale = 2, so 1500 / 100 = 15 HOURS > 10
    const d = getAccountSectionData({
      member: createMember(),
      account: createAccount(1500),
      activeOffers: [], activeNeeds: [],
      expiredOffers: [],
      transfers: [], history: [],
      currency: currencyWithScale as Currency
    });

    assert.strictEqual(d.balanceAdviceId, 'newsletter.balance_advice_positive', 'Should handle currency scale correctly');
  });

});
