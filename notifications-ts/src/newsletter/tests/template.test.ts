/**
 * Template snapshot tests for the newsletter HTML/text rendering.
 *
 * These tests verify that the full newsletter pipeline (service → template → email)
 * produces output matching saved snapshots, catching regressions in template or
 * rendering logic changes.
 *
 * Snapshots live in snapshots/newsletter.html and snapshots/newsletter.txt.
 * To regenerate them after an intentional template change, run:
 * UPDATE_SNAPSHOTS=1 pnpm test-one src/newsletter/tests/template.test.ts
 */
import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import prisma from '../../utils/prisma';
import { server } from '../../mocks/server';
import { mockDate, restoreDate } from '../../mocks/date';
import { mockDb } from '../../mocks/prisma';
import { mockRedis } from '../../mocks/redis';
import { mockEmail } from '../../mocks/email';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotDir = path.join(__dirname, 'snapshots');
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === '1';

function assertOrUpdate(actual: string, snapshotFile: string, message: string) {
  const fullPath = path.join(snapshotDir, snapshotFile);
  if (UPDATE_SNAPSHOTS) {
    writeFileSync(fullPath, actual);
    console.log(`Snapshot updated: ${snapshotFile}`);
  } else {
    const expected = readFileSync(fullPath, 'utf-8');
    assert.strictEqual(actual, expected, message);
  }
}

// Mock nodemailer, Prisma and Redis
const email = mockEmail();
const { newsletterLog } = mockDb();
const { reset: resetRedis } = mockRedis();

describe('Newsletter Template Snapshots', () => {
  let runNewsletter: (options?: { groupCode?: string; memberCode?: string; forceSend?: boolean }) => Promise<void>;

  before(async () => {
    const newsletterModule = await import('../service');
    runNewsletter = newsletterModule.runNewsletter;
    server.listen({ onUnhandledRequest: 'bypass' });
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

  test('HTML output matches snapshot', async () => {
    // Sunday 2026-01-04 14:30 UTC = 15:30 Madrid time (UTC+1 winter) → newsletter window
    mockDate('2026-01-04T14:30:00Z');

    await runNewsletter({ groupCode: 'GRP1', memberCode: 'userGRP10' });

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one email for the target member');
    const emailOptions = email.lastEmail();

    assertOrUpdate(
      emailOptions.html,
      'newsletter.html',
      'Generated HTML does not match the snapshot. If the template was intentionally changed, ' +
        'update the snapshot file at src/newsletter/tests/snapshots/newsletter.html',
    );
  });

  test('text output (autoconverted from HTML) matches snapshot', async () => {
    mockDate('2026-01-04T14:30:00Z');

    await runNewsletter({ groupCode: 'GRP1', memberCode: 'userGRP10' });

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one email for the target member');
    const emailOptions = email.lastEmail();

    assertOrUpdate(
      emailOptions.text!,
      'newsletter.txt',
      'Generated plain-text does not match the snapshot. If the template was intentionally changed, ' +
        'update the snapshot file at src/newsletter/tests/snapshots/newsletter.txt',
    );
  });
});
