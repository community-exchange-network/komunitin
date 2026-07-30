import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { KomunitinClient } from './client';
import { server } from '../../mocks/server';

describe('KomunitinClient', () => {
  before(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  after(() => {
    server.close();
  });

  it('should fetch currency data', async () => {
    const client = new KomunitinClient();

    const currency = await client.getCurrency('GRP0');

    assert.ok(currency, 'Currency should be defined');
    assert.strictEqual(currency.attributes.code, 'GRP0', 'Currency code should match');
    assert.ok(currency.attributes.symbol, 'Currency should have a symbol');
    assert.ok(currency.attributes.rate, 'Currency should have a rate');
    assert.strictEqual(currency.attributes.symbol, 'ħ', 'GRP0 should use ħ symbol');
    assert.deepStrictEqual(currency.attributes.rate, { n: 100, d: 1 }, 'Rate should be 100:1');
  });

  it('should fetch transfer stats', async () => {
    const client = new KomunitinClient();

    const stats = await client.getTransferStats('GRP0');

    assert.ok(stats, 'Stats should be defined');
    assert.ok(stats.attributes.values, 'Stats should have values');
    assert.ok(Array.isArray(stats.attributes.values), 'Values should be an array');
    assert.strictEqual(stats.attributes.values[0], 54, 'Should return mocked transfer count');
  });

  it('uses the canonical Social post and admin routes', async () => {
    const client = new KomunitinClient();
    const offers = await client.getOffers('GRP0', {
      'filter[status]': 'published',
      'filter[created][gt]': '1970-01-01T00:00:00.000Z',
    });
    const needs = await client.getNeeds('GRP0', {
      'filter[status]': 'published',
      'filter[expires][lt]': '9999-01-01T00:00:00.000Z',
    });
    const post = await client.getPost('GRP0', offers[0].id, ['member']);
    const admins = await client.getGroupAdmins('GRP0');

    assert.strictEqual(offers.length, 15);
    assert.ok(offers.every(offer => offer.type === 'offers'));
    assert.strictEqual(needs.length, 10);
    assert.ok(needs.every(need => need.type === 'needs'));
    assert.strictEqual(post.data.id, offers[0].id);
    assert.strictEqual(post.included?.[0].id, offers[0].relationships.member.data.id);
    assert.deepStrictEqual(admins.map(admin => admin.id), ['admin-GRP0']);
  });

  it('sends the committed state filter to Accounting', async () => {
    const client = new KomunitinClient();
    const transfers = await client.getTransfers('GRP0', { 'filter[state]': 'committed' });

    assert.strictEqual(transfers.length, 10);
    assert.ok(transfers.every(transfer => transfer.attributes.state === 'committed'));
  });
});
