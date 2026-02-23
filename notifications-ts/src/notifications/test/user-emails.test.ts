import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { mockEmail } from "../../mocks/email";
import { createMember, db, getUserIdForMember } from "../../mocks/db";
import { createEvent, setupNotificationsTest } from "./utils";

// mockEmail must be imported before setupNotificationsTest so that
// nodemailer.createTransport is patched before the worker (and Mailer) loads.
const email = mockEmail();

const { put } = setupNotificationsTest({ useWorker: true });

const createUserEvent = (groupCode: string, eventName: string, eventId: string) => {
  const member = createMember({ groupCode });
  const userId = getUserIdForMember(member.id);
  const user = db.users.find(u => u.id === userId)!;

  const eventData = createEvent(
    eventName,
    userId,
    groupCode,
    userId,
    eventId,
    'user'
  );

  return {user, eventData};
}

describe('User emails', () => {
  beforeEach(() => {
    email.reset();
  });

  it('should send validation email', async () => {
    const {user, eventData} = createUserEvent('GRP1', 'ValidationEmailRequested', 'test-event-validation-email');

    await put(eventData);

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one validation email');
    const msg = email.lastEmail();

    // Sent to the correct user's email address
    assert.strictEqual(msg.to, user.attributes.email);

    // Subject mentions the group name
    assert.ok(
      msg.subject.includes('Group GRP1'),
      `Subject should contain group name. Got: "${msg.subject}"`
    );

    // HTML contains the signup CTA URL with group code and auth token
    const expectedUrl = '/groups/GRP1/signup-member?token=mock-unsubscribe-token';
    assert.ok(msg.html.includes(expectedUrl), 'HTML should contain signup URL with token');

    // Plain text (auto-converted from HTML) also carries the link
    assert.ok(msg.text?.includes(expectedUrl), 'Plain text should contain signup URL with token');
  });

  it('should send reset password email', async () => {
    const {user, eventData} = createUserEvent('GRP1', 'PasswordResetRequested', 'test-event-reset-password');

    await put(eventData);

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one reset password email');
    const msg = email.lastEmail();

    // Sent to the correct user's email address
    assert.strictEqual(msg.to, user.attributes.email);

    // Subject mentions the group name
    assert.ok(
      msg.subject.includes('Group GRP1'),
      `Subject should contain group name. Got: "${msg.subject}"`
    );

    // Label
    assert.ok(msg.html.includes('Reset password'))
    assert.ok(msg.text.includes('Reset password'))

    // HTML contains the reset password CTA URL with auth token
    const expectedUrl = '/set-password?token=mock-unsubscribe-token';
    assert.ok(msg.html.includes(expectedUrl), 'HTML should contain reset password URL with token');

    // Plain text (auto-converted from HTML) also carries the link
    assert.ok(msg.text?.includes(expectedUrl), 'Plain text should contain reset password URL with token');
    
  });
});
