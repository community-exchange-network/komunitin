import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { http, HttpResponse } from 'msw';
import { KomunitinClient } from './client';
import { server } from '../../mocks/server';
import { createMember, createMemberUser, createUser, resetDb } from '../../mocks/db';
import { SOCIAL_URL } from '../../mocks/handlers';

describe('KomunitinClient', () => {
  before(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    resetDb();
    server.resetHandlers();
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

  it('fetches every member-user relation with its included user', async () => {
    const sharedUser = createUser({ id: 'shared-user', email: 'shared@example.com' });
    const otherUser = createUser({ id: 'other-user', email: 'other@example.com' });
    const firstMember = createMember({ groupCode: 'TEST', id: 'member-1', userId: sharedUser.id });
    const secondMember = createMember({ groupCode: 'TEST', id: 'member-2', userId: sharedUser.id });
    createMemberUser({ memberId: firstMember.id, userId: otherUser.id });

    const relations = await new KomunitinClient().getMemberUsers('TEST', [firstMember.id, secondMember.id]);

    assert.strictEqual(relations.length, 3);
    assert.deepStrictEqual(
      relations.map(({ memberUser, user }) => [
        memberUser.relationships.member.data.id,
        user.id,
      ]).sort(),
      [
        ['member-1', 'other-user'],
        ['member-1', 'shared-user'],
        ['member-2', 'shared-user'],
      ],
    );
  });

  it('batches member filters and follows member-user pagination', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(`${SOCIAL_URL}/:groupCode/member-users`, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const memberIds = url.searchParams.get('filter[member]')!.split(',');
        const after = url.searchParams.get('page[after]');
        const memberId = after ? memberIds[1] : memberIds[0];
        const userId = `user-${memberId}`;
        const next = memberIds.length === 50 && !after
          ? `${url.origin}${url.pathname}?${new URLSearchParams({
              ...Object.fromEntries(url.searchParams),
              'page[after]': 'next',
            })}`
          : null;

        return HttpResponse.json({
          data: [{
            type: 'member-users',
            id: `member-user-${memberId}`,
            attributes: {
              emails: { group: 'weekly', myAccount: true },
              notifications: { myAccount: true, group: true },
            },
            relationships: {
              member: { data: { type: 'members', id: memberId } },
              user: { data: { type: 'users', id: userId } },
            },
          }],
          included: [{
            type: 'users',
            id: userId,
            attributes: { email: `${userId}@example.com`, language: 'en' },
          }],
          links: { next },
        });
      }),
    );

    const memberIds = Array.from({ length: 51 }, (_, index) => `member-${index}`);
    const relations = await new KomunitinClient().getMemberUsers('TEST', memberIds);

    assert.strictEqual(relations.length, 3);
    assert.deepStrictEqual(
      requests.map(url => url.searchParams.get('filter[member]')!.split(',').length),
      [50, 50, 1],
    );
    assert.deepStrictEqual(
      requests.map(url => url.searchParams.get('page[after]')),
      [null, 'next', null],
    );
  });
});
