import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { mockEmail } from "../../mocks/email";
import { createMember, db, getUserIdForMember } from "../../mocks/db";
import { createEvent, setupNotificationsTest } from "./utils";

// mockEmail must be imported before setupNotificationsTest so that
// nodemailer.createTransport is patched before the worker (and Mailer) loads.
const email = mockEmail();

const { put } = setupNotificationsTest({ useWorker: true });

describe('User emails', () => {
  beforeEach(() => {
    email.reset();
  });

  it('should send validation email', async () => {
    const groupCode = 'GRP1';
    const member = createMember({ groupCode });
    const userId = getUserIdForMember(member.id);
    const user = db.users.find(u => u.id === userId)!;

    const eventData = createEvent(
      'UserRequestedEmailValidation',
      userId,
      groupCode,
      userId,
      'test-event-validate',
      'user'
    );

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
});
