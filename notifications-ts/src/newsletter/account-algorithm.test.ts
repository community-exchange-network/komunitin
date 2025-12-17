import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getAccountSectionData } from './account-algorithm';
import { Member, Offer, Need, HistoryLog } from './types';

// Helpers
const createMember = (attrs: any = {}): Member => ({
  id: 'm1',
  attributes: { image: 'img', bio: 'bio', address: 'loc', ...attrs }
});

const createAccount = (balance: number) => ({
  attributes: { balance }
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
      activeOffers: [], activeNeeds: [], expiredOffers: [], expiredNeeds: [], transfers: [], history: [],
    });
    assert.strictEqual(d1.balanceAdvice, "You have given more than received. You can use your balance to fulfill your needs and recirculate it to the community.");

    // < -10
    const d2 = getAccountSectionData({
      member: createMember(),
      account: createAccount(-15),
      activeOffers: [], activeNeeds: [], expiredOffers: [], expiredNeeds: [], transfers: [], history: [],
    });
    assert.strictEqual(d2.balanceAdvice, "You have received more than given. Try to balance it by offering and helping your community.");

    // ~ 0
    const d3 = getAccountSectionData({
      member: createMember(),
      account: createAccount(1),
      activeOffers: [], activeNeeds: [], expiredOffers: [], expiredNeeds: [], transfers: [], history: [],
    });
    assert.strictEqual(d3.balanceAdvice, "Your balance is well balanced!");
  });

  test('Alert Priorities', () => {
    // 1. No offers + Negative Balance
    const d1 = getAccountSectionData({
      member: createMember(),
      account: createAccount(-5),
      activeOffers: [], activeNeeds: [], // No offers/needs
      expiredOffers: [], expiredNeeds: [], transfers: [], history: [],
    });
    assert.strictEqual(d1.alert?.type, 'NO_OFFERS_NEGATIVE', 'Should define priority 1 alert');

    // 2. No needs + Positive (offers exist to skip priority 1/3)
    const offer = { id: 'o1' } as Offer;
    const d2 = getAccountSectionData({
      member: createMember(),
      account: createAccount(5),
      activeOffers: [offer], activeNeeds: [],
      expiredOffers: [], expiredNeeds: [], transfers: [], history: [],
    });
    assert.strictEqual(d2.alert?.type, 'NO_NEEDS_POSITIVE', 'Should define priority 2 alert');

    // 3. No offers (Balance positive)
    const d3 = getAccountSectionData({
      member: createMember(),
      account: createAccount(5),
      activeOffers: [], activeNeeds: [],
      expiredOffers: [], expiredNeeds: [], transfers: [], history: [],
    });
    // Priority 1 fails (balance not < 0). Priority 2 fails (needs empty but we care about offers).
    // Wait. Alert 3 is "No offers".
    // Is alert 2 check "No needs AND positive"? Yes.
    // If I have No Offers and Balance > 0.
    // 1 (NoOffersNeg) -> False.
    // 2 (NoNeedsPos) -> "You have no active needs...". Wait.
    // My input for d3 has No Offers AND No Needs.
    // Priority 2 matches (No Needs + Pos). So it will show Priority 2.
    // If I want to verify Priority 3 "No Offers", I must NOT match Priority 2.
    // So I need HAS NEEDS.
    const need = { id: 'n1' } as Need;
    const d3_fixed = getAccountSectionData({
      member: createMember(),
      account: createAccount(5),
      activeOffers: [], activeNeeds: [need],
      expiredOffers: [], expiredNeeds: [], transfers: [], history: [],
    });
    assert.strictEqual(d3_fixed.alert?.type, 'NO_OFFERS', 'Should define priority 3 alert');
  });

  test('History Logic - Skipping Repeated Alerts', () => {
    // Priority 1 alert condition
    const dataBase = {
      member: createMember(),
      account: createAccount(-5),
      activeOffers: [], activeNeeds: [], expiredOffers: [], expiredNeeds: [], transfers: [],
    };

    // Case: No history. Shows Alert 1.
    const run1 = getAccountSectionData({ ...dataBase, history: [] });
    assert.strictEqual(run1.alert?.type, 'NO_OFFERS_NEGATIVE');

    // Case: History has 1 occurence. Shows Alert 1 (2nd time).
    const log1 = { content: { accountSection: { alert: { type: 'NO_OFFERS_NEGATIVE' } } } } as any;
    const run2 = getAccountSectionData({ ...dataBase, history: [log1] });
    assert.strictEqual(run2.alert?.type, 'NO_OFFERS_NEGATIVE');

    // Case: History has 2 occurences. Should Skip Alert 1 and show Alert 3 (No Offers)
    // Why Alert 3?
    // Priority 1: NO_OFFERS_NEGATIVE (Skipped)
    // Priority 2: NO_NEEDS_POSITIVE (Balance < 0, False)
    // Priority 3: NO_OFFERS (True, No active offers)
    const log2 = { content: { accountSection: { alert: { type: 'NO_OFFERS_NEGATIVE' } } } } as any;
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
      expiredOffers: [], expiredNeeds: [],
      transfers: [t1, t2, t3],
      history: [],
    });

    assert.strictEqual(d.activityText, '2 exchanges during last month');
  });

});
