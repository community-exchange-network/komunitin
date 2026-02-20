/**
 * Email mock for testing.
 *
 * Import this module *before* any module that instantiates Mailer (directly or
 * transitively), so that nodemailer.createTransport is patched at construction time.
 *
 * Usage:
 *   import { mockEmail } from '../../mocks/email';
 *   const email = mockEmail();
 *
 *   // In beforeEach:
 *   email.reset();
 *
 *   // Assertions:
 *   assert.strictEqual(email.sentEmails.length, 1);
 *   const msg = email.lastEmail();
 *   assert.ok(msg.html.includes('...'));
 */
import { test } from 'node:test';
import nodemailer from 'nodemailer';

export type SentEmail = {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

const sentEmails: SentEmail[] = [];

const sendMailMock = test.mock.fn((options: SentEmail) => {
  sentEmails.push(options);
  return Promise.resolve({ messageId: 'mock-id' });
});

// Patch nodemailer at module load time so any subsequent Mailer instantiation
// picks up the mock transporter.
nodemailer.createTransport = test.mock.fn(() => ({
  sendMail: sendMailMock,
})) as any;


/**
 * Returns a handle to the shared email mock state.
 * Safe to call multiple times — always returns the same underlying store.
 */
export const mockEmail = () => ({
  sentEmails,
  reset: () => {
    sentEmails.length = 0;
    sendMailMock.mock.resetCalls();
  },
  lastEmail: () => {
    if (sentEmails.length === 0) throw new Error('No emails have been sent');
    return sentEmails[sentEmails.length - 1];
  },
});
