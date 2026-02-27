import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { mockEmail } from "../../mocks/email";
import { createGroup, db } from "../../mocks/db";
import { createEvent, setupNotificationsTest } from "./utils";

// mockEmail must be imported before setupNotificationsTest so that
// nodemailer.createTransport is patched before the worker (and Mailer) loads.
const email = mockEmail();

const { put } = setupNotificationsTest({ useWorker: true });

describe('GroupRequested emails', () => {
  beforeEach(() => {
    email.reset();
  });

  it('should send group requested email to superadmin', async () => {
    const groupCode = 'GRP1';
    createGroup(groupCode);

    // The requesting user (group admin) triggers the event, but the email
    // goes to the server superadmin defined by ADMIN_EMAIL env var.
    const adminUser = db.users.find(u => u.id === `admin-${groupCode}`);
    assert.ok(adminUser, 'Admin user should exist');

    const eventData = createEvent(
      'GroupRequested',
      groupCode,
      groupCode,
      adminUser.id,
      'test-group-requested-1',
      'group'
    );

    await put(eventData);

    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly one email');
    const msg = email.lastEmail();

    // Sent to ADMIN_EMAIL (superadmin), not to the group admin
    assert.strictEqual(msg.to, 'superadmin@test.com');

    // Subject mentions the group name
    assert.ok(
      msg.subject.includes('Group GRP1'),
      `Subject should contain group name. Got: "${msg.subject}"`
    );
    assert.ok(msg.subject.toLowerCase().includes('requested'), 'Subject should mention requested');

    // Label
    assert.ok(msg.html.includes('Community requested'), 'HTML should contain requested label');

    // Greeting (superadmin, no name)
    assert.ok(msg.html.includes('Hello admin'), 'HTML should greet the admin');

    // Body text
    assert.ok(msg.html.includes('Group GRP1'), 'HTML should contain the group name');
    assert.ok(msg.html.includes('review the request'), 'HTML should contain review instructions');

    // CTA URL points to superadmin groups page
    const expectedUrl = '/superadmin/groups';
    assert.ok(msg.html.includes(expectedUrl), 'HTML should contain the superadmin groups URL');

    // Text version
    assert.ok(msg.text?.includes(expectedUrl), 'Text should contain superadmin groups URL');

    // Reason mentions server administrator
    assert.ok(msg.html.includes('server administrator'), 'HTML should contain superadmin reason text');
  });
});
