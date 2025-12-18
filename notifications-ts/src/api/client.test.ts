import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { KomunitinClient } from './client';
import { server } from '../mocks/server';

describe('KomunitinClient', () => {
  before(() => {
    server.listen();
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
});
