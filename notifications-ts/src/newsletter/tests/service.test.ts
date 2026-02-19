import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';
import prisma from '../../utils/prisma';
import { mockDate, restoreDate } from '../../mocks/date';
import { mockDb } from '../../mocks/prisma';
import { mockRedis } from '../../mocks/redis';
import { mockEmail } from '../../mocks/email';

const email = mockEmail();

// Mock Prisma
const { newsletterLog } = mockDb();

const { reset: resetRedis } = mockRedis();

describe('Newsletter Cron Job', () => {
  let runNewsletter: (options?: { forceSend?: boolean }) => Promise<void>;
  before(async () => {
    // We need to delay import until mocks (redis) are set up.
    const newsletterModule = await import('../service');
    runNewsletter = newsletterModule.runNewsletter;
    server.listen({ onUnhandledRequest: 'bypass' })
  });
  after(() => server.close());
  
  beforeEach(() => {
    server.resetHandlers();
    email.reset();
    newsletterLog.length = 0;
    // @ts-ignore
    prisma.newsletterLog.create.mock.resetCalls();
    // @ts-ignore
    prisma.newsletterLog.findMany.mock.resetCalls();
    resetRedis();
  });

  afterEach(() => {
    restoreDate();
  });

  test('should generate and send newsletter', async () => {
    // Mock date to Sunday 15:30 Madrid time (UTC+1 in winter) -> 14:30 UTC
    mockDate('2026-01-04T14:30:00Z');
    
    await runNewsletter();

    // Verify emails were sent
    assert.ok(email.sentEmails.length > 0, 'Should send at least one email');

    const emailOptions = email.sentEmails[0];

    assert.ok(emailOptions.to, 'Email should have a recipient');
    assert.ok(emailOptions.subject, 'Email should have a subject');
    assert.ok(emailOptions.html, 'Email should have HTML content');

    // Check DB Log
    assert.ok(
      // @ts-ignore
      prisma.newsletterLog.create.mock.calls.length >= 1,
      'Should create at least one log entry'
    );

    // @ts-ignore
    const logCall = prisma.newsletterLog.create.mock.calls[0];
    const logData = logCall.arguments[0].data;

    // Verify structure
    assert.ok(logData.memberId, 'Log should have memberId');
    assert.ok(logData.recipients, 'Log should have recipients');
    assert.strictEqual(Array.isArray(logData.recipients), true, 'Recipients should be an array');
    assert.ok(logData.recipients.length > 0, 'Should have at least one recipient');
    assert.ok(logData.content, 'Log should have content');

    // Check if content contains expected mocked data parts
    // Verify Account Section in Log
    assert.ok(logData.content.account, 'Log should have account');
    // If our mock account has balance (random), and transfers (mocked), it should produce some data.
    assert.ok(logData.content.account.balance !== undefined, 'Account section should have balance');
  });

  test('should skip groups with enableGroupEmail disabled', async () => {
    // Override the group settings handler to return enableGroupEmail: false
    server.use(
      http.get('http://social.test/:groupCode/settings', () => {
        return HttpResponse.json({
          data: {
            type: 'group-settings',
            id: 'settings',
            attributes: {
              enableGroupEmail: false
            }
          }
        });
      })
    );

    email.reset();
    // @ts-ignore
    prisma.newsletterLog.create.mock.resetCalls();

    await runNewsletter();

    // Verify no emails were sent
    assert.strictEqual(email.sentEmails.length, 0, 'Should not send any emails when enableGroupEmail is false');
    
    // Verify no logs were created
    assert.strictEqual(
      // @ts-ignore
      prisma.newsletterLog.create.mock.calls.length,
      0,
      'Should not create any log entries when enableGroupEmail is false'
    );
  });

  test('should cache groups and not hit endpoint repeatedly', async () => {
    let groupsCallCount = 0;
    
    // Override handler to count calls and return minimal data
    server.use(
      http.get('http://social.test/groups', () => {
        groupsCallCount++;
        return HttpResponse.json({
          data: [
            {
              type: 'groups',
              id: 'g-cache-test',
              attributes: {
                code: 'TEST',
                name: 'Test Group',
                access: 'public',
                location: { type: 'Point', coordinates: [0, 0] }
              }
            }
          ]
        });
      })
    );

    // Set date to Sunday 15:30
    const initialDate = '2026-01-04T14:30:00Z';
    mockDate(initialDate);

    // 1. Force refresh to ensure known state
    // We use forceSend: true to trigger the fetch.
    await runNewsletter({ forceSend: true });
    assert.strictEqual(groupsCallCount, 1, 'Should fetch groups when forced');

    // 2. Normal run immediately after
    await runNewsletter();
    assert.strictEqual(groupsCallCount, 1, 'Should use cache on second run');

    // 3. Advance time by 25 hours
    // 2026-01-05T15:30:00Z (Monday)
    mockDate('2026-01-05T15:30:00Z');

    // 4. Normal run after TTL
    await runNewsletter();
    assert.strictEqual(groupsCallCount, 2, 'Should refresh cache after TTL');
  });
});
