import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { mockEmail } from "../../mocks/email";
import { createMember, db, getUserIdForMember } from "../../mocks/db";
import { createEvent, setupNotificationsTest } from "./utils";

// mockEmail must be imported before setupNotificationsTest so that
// nodemailer.createTransport is patched before the worker (and Mailer) loads.
const email = mockEmail();

const { put } = setupNotificationsTest({ useWorker: true });

describe('MemberRequested emails', () => {
  beforeEach(() => {
    email.reset();
  });

  it('should send member requested email to group admins', async () => {
    const groupCode = 'GRP1';
    const member = createMember({
      groupCode,
      name: 'Ada Lovelace',
      attributes: {
        address: {
          streetAddress: '123 Main St',
          addressLocality: 'Barcelona',
          postalCode: '08001',
          addressRegion: 'Catalonia',
          addressCountry: 'ES',
        }
      }
    });
    const userId = getUserIdForMember(member.id);

    const eventData = createEvent(
      'MemberRequested',
      member.id,
      groupCode,
      userId,
      'test-member-requested-1',
      'member'
    );

    await put(eventData);

    // Find the admin user for GRP1
    const adminUser = db.users.find(u => u.id === `admin-${groupCode}`);
    assert.ok(adminUser, 'Admin user should exist');

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one email to the admin');
    const msg = email.lastEmail();

    // Sent to the admin's email address, not the member's
    assert.strictEqual(msg.to, adminUser.attributes.email);

    // Subject mentions the group name
    assert.ok(
      msg.subject.includes('Group GRP1'),
      `Subject should contain group name. Got: "${msg.subject}"`
    );

    // Label
    assert.ok(msg.html.includes('Membership request'), 'HTML should contain membership request label');

    // Greeting addresses admin
    assert.ok(msg.html.includes('Hello admin'), 'HTML should greet the admin');

    // The member name appears in the email
    assert.ok(msg.html.includes('Ada Lovelace'), 'HTML should contain the member name');

    // The member email appears in the email
    const memberUser = db.users.find(u => u.id === userId);
    assert.ok(memberUser, 'Member user should exist');
    assert.ok(msg.html.includes(memberUser.attributes.email), 'HTML should contain the member email');

    // The member town appears in the email
    assert.ok(msg.html.includes('Barcelona'), 'HTML should contain the member town');

    // CTA URL points to admin accounts page
    const expectedUrl = '/groups/GRP1/admin/accounts';
    assert.ok(msg.html.includes(expectedUrl), 'HTML should contain the admin accounts URL');

    // Text version also contains key info
    assert.ok(msg.text?.includes('Ada Lovelace'), 'Text should contain member name');
    assert.ok(msg.text?.includes(expectedUrl), 'Text should contain admin accounts URL');

    // The reason mentions admin role
    assert.ok(msg.html.includes('administrator'), 'HTML should contain admin reason text');
  });

  it('should send member requested email without town when address is not set', async () => {
    const groupCode = 'GRP2';
    const member = createMember({
      groupCode,
      name: 'Grace Hopper',
      // No address provided
    });
    const userId = getUserIdForMember(member.id);

    const eventData = createEvent(
      'MemberRequested',
      member.id,
      groupCode,
      userId,
      'test-member-requested-2',
      'member'
    );

    await put(eventData);

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one email');
    const msg = email.lastEmail();

    // The member name still appears
    assert.ok(msg.html.includes('Grace Hopper'), 'HTML should contain the member name');

    // Town label should not appear since no address
    assert.ok(!msg.html.includes('Town:'), 'HTML should not contain town label when no address');

    // Still has the CTA
    const expectedUrl = '/groups/GRP2/admin/accounts';
    assert.ok(msg.html.includes(expectedUrl), 'HTML should contain the admin accounts URL');
  });
});
