import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createEventBody, setupNotificationsTest } from './utils';
import { EVENT_NAME } from '../events';

const credentials = Buffer.from('testuser:testpass').toString('base64');
const badCredentials = Buffer.from('wrong:creds').toString('base64');

const { app, eventsQueue } = setupNotificationsTest({
  useWorker: true,
});

describe('POST /events', () => {
  describe('Authentication', () => {
    it('rejects requests without auth', async () => {
      const body = createEventBody('TransferCommitted', { code: 'GRP1', user: 'user-1', data: { transfer: 'tx-1' } });
      const res = await app
        .post('/events')
        .set('Content-Type', 'application/vnd.api+json')
        .send(body)
        .expect(401);

      assert.ok(res.body.errors);
      assert.strictEqual(res.body.errors[0].status, '401');
    });

    it('rejects requests with invalid credentials', async () => {
      const body = createEventBody('TransferCommitted', { code: 'GRP1', user: 'user-1', data: { transfer: 'tx-1' } });
      const res = await app
        .post('/events')
        .set('Content-Type', 'application/vnd.api+json')
        .set('Authorization', `Basic ${badCredentials}`)
        .send(body)
        .expect(401);

      assert.ok(res.body.errors);
      assert.strictEqual(res.body.errors[0].status, '401');
    });

    it('accepts requests with valid credentials', async () => {
      const body = createEventBody('TransferCommitted', { code: 'GRP1', user: 'user-1', data: { transfer: 'tx-1' } });
      const res = await app
        .post('/events')
        .set('Content-Type', 'application/vnd.api+json')
        .set('Authorization', `Basic ${credentials}`)
        .send(body)
        .expect(201);

      assert.strictEqual(res.body.data.type, 'events');
    });
  });

  describe('Validation', () => {
    const post = (body: any) =>
      app
        .post('/events')
        .set('Content-Type', 'application/vnd.api+json')
        .set('Authorization', `Basic ${credentials}`)
        .send(body);

    it('rejects missing body data', async () => {
      const res = await post({}).expect(400);
      assert.ok(res.body.errors[0].detail.includes('Missing JSON:API data'));
    });

    it('rejects invalid resource type', async () => {
      const res = await post({
        data: {
          type: 'wrong',
          attributes: { name: 'TransferCommitted' },
          relationships: { user: { data: { type: 'users', id: 'u1' } } },
        },
      }).expect(400);
      assert.ok(res.body.errors[0].detail.includes('Invalid resource type'));
    });

    it('rejects invalid event name', async () => {
      const res = await post({
        data: {
          type: 'events',
          attributes: { name: 'NonExistentEvent', source: 's', code: 'c', time: new Date().toISOString(), data: {} },
          relationships: { user: { data: { type: 'users', id: 'u1' } } },
        },
      }).expect(400);
      assert.ok(res.body.errors[0].detail.includes('Invalid or missing event name'));
    });

    it('rejects missing user relationship', async () => {
      const res = await post({
        data: {
          type: 'events',
          attributes: { name: 'TransferCommitted', source: 's', code: 'c', time: new Date().toISOString(), data: {} },
        },
      }).expect(400);
      assert.ok(res.body.errors[0].detail.includes("Missing 'user' relationship"));
    });

    it('rejects non-string data values', async () => {
      const res = await post({
        data: {
          type: 'events',
          attributes: { name: 'TransferCommitted', source: 's', code: 'c', time: new Date().toISOString(), data: { key: 123 } },
          relationships: { user: { data: { type: 'users', id: 'u1' } } },
        },
      }).expect(400);
      assert.ok(res.body.errors[0].detail.includes('Data field must be a map of strings'));
    });

    it('rejects invalid time format', async () => {
      const res = await post({
        data: {
          type: 'events',
          attributes: { name: 'TransferCommitted', source: 's', code: 'c', time: 'not-a-date', data: {} },
          relationships: { user: { data: { type: 'users', id: 'u1' } } },
        },
      }).expect(400);
      assert.ok(res.body.errors[0].detail.includes('Invalid time format'));
    });
  });

  describe('Successful event creation', () => {
    it('returns 201 with JSON:API response', async () => {
      const body = createEventBody('TransferCommitted', { code: 'GRP1', user: 'user-42', data: { transfer: 'tx-100' } });
      const res = await app
        .post('/events')
        .set('Content-Type', 'application/vnd.api+json')
        .set('Authorization', `Basic ${credentials}`)
        .send(body)
        .expect(201);

      const { data } = res.body;
      assert.strictEqual(data.type, 'events');
      assert.ok(data.id, 'Response should include a job ID');
      assert.strictEqual(data.attributes.name, 'TransferCommitted');
      assert.strictEqual(data.attributes.code, 'GRP1');
      assert.deepStrictEqual(data.attributes.data, { transfer: 'tx-100' });
      assert.strictEqual(data.relationships.user.data.id, 'user-42');
      assert.strictEqual(data.relationships.user.data.type, 'users');
    });

    it('enqueues the event in the BullMQ events queue', async () => {
      const body = createEventBody('MemberJoined', { code: 'GRP1', user: 'user-1', data: { member: 'member-1' } });
      await app
        .post('/events')
        .set('Content-Type', 'application/vnd.api+json')
        .set('Authorization', `Basic ${credentials}`)
        .send(body)
        .expect(201);

      // The mock queue should have received the add call
      assert.strictEqual(eventsQueue.add.mock.callCount(), 1);
      const [jobName, jobData] = eventsQueue.add.mock.calls[0].arguments;
      assert.strictEqual(jobName, 'MemberJoined');
      assert.strictEqual(jobData.name, 'MemberJoined');
      assert.strictEqual(jobData.code, 'GRP1');
      assert.strictEqual(jobData.user, 'user-1');
      assert.deepStrictEqual(jobData.data, { member: 'member-1' });
    });

    it('accepts all valid event types', async () => {
      const eventNames = Object.values(EVENT_NAME);

      for (const name of eventNames) {
        const body = createEventBody(name, { code: 'GRP1', user: 'user-1', data: { transfer: 'payload-1' } });
        await app
          .post('/events')
          .set('Content-Type', 'application/vnd.api+json')
          .set('Authorization', `Basic ${credentials}`)
          .send(body)
          .expect(201);
      }
    });
  });
});
