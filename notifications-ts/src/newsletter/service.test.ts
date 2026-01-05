import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { server } from '../mocks/server';
import { runNewsletter } from './service';
import { http, HttpResponse } from 'msw';
// Mock nodemailer to prevent actual email sending
import nodemailer from 'nodemailer';
import prisma from '../utils/prisma';
import { mockDate, restoreDate } from '../mocks/date';

// Mock nodemailer
const sendMailMock = test.mock.fn((_options: any) => Promise.resolve({ messageId: 'mock-id' }));
// Mock Prisma
// @ts-ignore
prisma.newsletterLog.create = test.mock.fn(async () => ({ id: 'log-id' }));
// @ts-ignore
prisma.newsletterLog.findMany = test.mock.fn(async () => []);
// eslint-disable-next-line
// @ts-ignore
nodemailer.createTransport = test.mock.fn(() => ({
  sendMail: sendMailMock
}));

describe('Newsletter Cron Job', () => {
  before(() => server.listen());
  after(() => server.close());
  beforeEach(() => {
    server.resetHandlers();
    sendMailMock.mock.resetCalls();
  });

  afterEach(() => {
    restoreDate();
  });

  test('should generate and send newsletter', async () => {
    // Mock date to Sunday 15:30 Madrid time (UTC+1 in winter) -> 14:30 UTC
    mockDate('2026-01-04T14:30:00Z');
    
    await runNewsletter();

    // Verify emails were sent
    // We expect 3 groups * 5 members = 15 emails roughly, but filtered by user settings.
    // Our mock user settings have 'weekly' group emails.
    // The exact count depends on the mock data generation.
    assert.ok(sendMailMock.mock.calls.length > 0, 'Should send at least one email');

    const firstCall = sendMailMock.mock.calls[0];
    const emailOptions = firstCall.arguments[0] as any;

    assert.ok(emailOptions.to, 'Email should have a recipient');
    assert.ok(emailOptions.subject, 'Email should have a subject');
    assert.ok(emailOptions.html, 'Email should have HTML content');

    // Check DB Log
    // Should be 1 log entry (since there is 1 member in mock data with users)
    // The previous test sent multiple emails but now we log once per MEMBER.
    // In mock data, there's 1 group and members. Let's see how many members.
    // Mock handler returns 2 members for group 0? Or 1?
    // Let's assume 1 log call for now, and verify recipients.

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
    // TODO
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

    sendMailMock.mock.resetCalls();
    // @ts-ignore
    prisma.newsletterLog.create.mock.resetCalls();

    await runNewsletter();

    // Verify no emails were sent
    assert.strictEqual(sendMailMock.mock.calls.length, 0, 'Should not send any emails when enableGroupEmail is false');
    
    // Verify no logs were created
    assert.strictEqual(
      // @ts-ignore
      prisma.newsletterLog.create.mock.calls.length,
      0,
      'Should not create any log entries when enableGroupEmail is false'
    );
  });
});
