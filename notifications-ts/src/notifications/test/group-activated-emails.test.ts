import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { mockEmail } from "../../mocks/email";
import { db, createGroup } from "../../mocks/db";
import { createEvent, setupNotificationsTest } from "./utils";

// mockEmail must be imported before setupNotificationsTest so that
// nodemailer.createTransport is patched before the worker (and Mailer) loads.
const email = mockEmail();

const { put } = setupNotificationsTest({ useWorker: true });

describe('GroupActivated emails', () => {
  beforeEach(() => {
    email.reset();
  });

  it('should send group activated email to group admins', async () => {
    const groupCode = 'GRP1';
    createGroup(groupCode);

    const adminUser = db.users.find(u => u.id === `admin-${groupCode}`);
    assert.ok(adminUser, 'Admin user should exist');

    const eventData = createEvent(
      'GroupActivated',
      groupCode,
      groupCode,
      adminUser.id,
      'test-group-activated-1',
      'group'
    );

    await put(eventData);

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one email to the admin');
    const msg = email.lastEmail();

    // Sent to the admin's email address
    assert.strictEqual(msg.to, adminUser.attributes.email);

    // Subject mentions the group name
    assert.ok(
      msg.subject.includes('Group GRP1'),
      `Subject should contain group name. Got: "${msg.subject}"`
    );
    assert.ok(msg.subject.includes('activated'), 'Subject should mention activation');

    // Label
    assert.ok(msg.html.includes('Community activated'), 'HTML should contain activated label');

    // Greeting addresses admin
    assert.ok(msg.html.includes('Hello admin'), 'HTML should greet the admin');

    // Congratulations text
    assert.ok(msg.html.includes('Congratulations'), 'HTML should contain congratulations');
    assert.ok(msg.html.includes('Group GRP1'), 'HTML should contain the group name');

    // CTA URL points to admin page
    const expectedUrl = '/groups/GRP1/admin';
    assert.ok(msg.html.includes(expectedUrl), 'HTML should contain the admin URL');

    // Text version also contains key info
    assert.ok(msg.text?.includes('Congratulations'), 'Text should contain congratulations');
    assert.ok(msg.text?.includes(expectedUrl), 'Text should contain admin URL');

    // Reason mentions admin role
    assert.ok(msg.html.includes('administrator'), 'HTML should contain admin reason text');
  });
});
