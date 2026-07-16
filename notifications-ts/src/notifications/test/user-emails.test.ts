import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { http, HttpResponse } from "msw";
import { createMember, createUser, db, getUserIdForMember } from "../../mocks/db";
import { AUTH_URL } from "../../mocks/handlers";
import { createEvent, setupNotificationsTest } from "./utils";

const { put, email, server } = setupNotificationsTest({ useWorker: true });

const createUserAndMember = (groupCode: string) => {
  const member = createMember({ groupCode });
  const userId = getUserIdForMember(member.id);
  const user = db.users.find(u => u.id === userId)!;
  return { member, user };
};

describe('User emails', () => {
  beforeEach(() => {
    email.reset();
  });

  it('should send validation email', async () => {
    const { user } = createUserAndMember('GRP1');
    const eventData = createEvent('ValidationEmailRequested', {
      code: 'GRP1',
      user: user.id,
      data: {
        user: user.id,
        email: user.attributes.email,
        purpose: 'emailVerification',
        signup: { type: 'member', name: 'New Member', language: 'en', groupCode: 'GRP1' },
      },
    });

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

    // HTML contains the public email confirmation URL and purpose-bound token.
    const expectedUrl = '/confirm-email?token=mock-emailVerification-token';
    assert.ok(msg.html.includes(expectedUrl), 'HTML should contain signup URL with token');

    // Plain text (auto-converted from HTML) also carries the link
    assert.ok(msg.text?.includes(expectedUrl), 'Plain text should contain signup URL with token');
  });

  it('should send reset password email', async () => {
    const { user } = createUserAndMember('GRP1');
    const eventData = createEvent('PasswordResetRequested', {
      code: 'GRP1',
      user: user.id,
      data: { user: user.id, email: user.attributes.email },
    });

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
    const expectedUrl = '/set-password?token=mock-passwordReset-token';
    assert.ok(msg.html.includes(expectedUrl), 'HTML should contain reset password URL with token');

    // Plain text (auto-converted from HTML) also carries the link
    assert.ok(msg.text?.includes(expectedUrl), 'Plain text should contain reset password URL with token');
    
  });

  it('should send welcome email when member joins', async () => {
    const { member, user } = createUserAndMember('GRP1');
    const eventData = createEvent('MemberJoined', { code: 'GRP1', user: user.id, data: { member: member.id } });

    await put(eventData);

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one welcome email');
    const msg = email.lastEmail();

    assert.strictEqual(msg.to, user.attributes.email);

    assert.ok(
      msg.subject.includes('Welcome to Group GRP1!'),
      `Subject should contain welcome title. Got: "${msg.subject}"`
    );

    assert.ok(msg.html.includes('Welcome'));
    assert.ok(msg.text?.includes('Welcome'));

    const expectedMainUrl = '/home';
    assert.ok(msg.html.includes(expectedMainUrl), 'HTML should contain welcome main CTA URL');
    assert.ok(msg.text?.includes(expectedMainUrl), 'Plain text should contain welcome main CTA URL');

    const expectedSecondaryUrl = '/groups/GRP1';
    assert.ok(msg.html.includes(expectedSecondaryUrl), 'HTML should contain group URL');
    assert.ok(msg.text?.includes(expectedSecondaryUrl), 'Plain text should contain group URL');
  });

  it('should send validation email without group code', async () => {
    const user = createUser({ id: 'user-no-group', email: 'user-no-group@example.com' });
    const signup = { type: 'group' as const, name: 'New Group Admin', language: 'en' };
    let actionTokenRequest: unknown;
    assert.ok(server);
    server.use(http.post(`${AUTH_URL}/action-token`, async ({ request }) => {
      actionTokenRequest = await request.json();
      return HttpResponse.json({ token: 'group-validation-token' });
    }));
    const eventData = createEvent('ValidationEmailRequested', {
      code: null,
      user: user.id,
      data: {
        user: user.id,
        email: user.attributes.email,
        purpose: 'emailVerification',
        signup,
      },
    });

    await put(eventData);
    
    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one validation email');
    const msg = email.lastEmail();
    assert.strictEqual(msg.to, user.attributes.email);

    assert.ok(
      msg.text.includes('/confirm-email?token=group-validation-token'),
      'Validation email without group code should contain a public confirmation URL'
    );
    assert.deepStrictEqual(actionTokenRequest, {
      userId: user.id,
      purpose: 'emailVerification',
      signup,
    });

    assert.ok(
      msg.text.includes('Confirm your email'),
      'Validation email without group code should have correct subject and content'
    );

  })
});
