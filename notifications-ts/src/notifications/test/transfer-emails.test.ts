import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { mockEmail } from "../../mocks/email";
import { createTransfers, db } from "../../mocks/db";
import { createEvent, setupNotificationsTest } from "./utils";

// mockEmail must be imported before setupNotificationsTest so that
// nodemailer.createTransport is patched before the worker (and Mailer) loads.
const email = mockEmail();

const { put } = setupNotificationsTest({ useWorker: true });

const setupTestTransfer = () => {
  const groupId = 'GRP1';
  createTransfers(groupId);
  const transfer = db.transfers[0];

  const accountUserId = (accountId: string) => {
    const memberId = db.members.find(m => m.relationships.account.data.id === accountId)!.id;
    return db.users.find(u => {
      return u.relationships.members.data.some((r: any) => r.id === memberId);
    })!.id;
  };

  const payerUserId = accountUserId(transfer.relationships.payer.data.id);
  const payeeUserId = accountUserId(transfer.relationships.payee.data.id);

  const payerUser = db.users.find(u => u.id === payerUserId)!;
  const payeeUser = db.users.find(u => u.id === payeeUserId)!;

  const payerMember = db.members.find(m =>
    m.relationships.account.data.id === transfer.relationships.payer.data.id
  )!;
  const payeeMember = db.members.find(m =>
    m.relationships.account.data.id === transfer.relationships.payee.data.id
  )!;

  return { groupId, transfer, payerUserId, payeeUserId, payerUser, payeeUser, payerMember, payeeMember };
};

describe('Transfer emails', () => {
  beforeEach(() => {
    email.reset();
  });

  it('should send transfer committed emails (sent + received)', async () => {
    const { groupId, transfer, payerUserId, payerUser, payeeUser, payerMember, payeeMember } = setupTestTransfer();

    const eventData = createEvent('TransferCommitted', transfer.id, groupId, payerUserId, 'test-email-committed');
    await put(eventData);

    // Should send 2 emails: one to payer (sent), one to payee (received)
    assert.strictEqual(email.sentEmails.length, 2, 'Should send exactly 2 emails for TransferCommitted');

    // Find emails by recipient
    const payerEmail = email.sentEmails.find(e => e.to === payerUser.attributes.email);
    const payeeEmail = email.sentEmails.find(e => e.to === payeeUser.attributes.email);

    assert.ok(payerEmail, 'Payer should receive an email');
    assert.ok(payeeEmail, 'Payee should receive an email');

    // Payer email: "sent" confirmation
    assert.ok(
      payerEmail.subject.includes('sent'),
      `Payer subject should indicate "sent". Got: "${payerEmail.subject}"`
    );
    assert.ok(payerEmail.html.includes('Transfer sent'), 'Payer HTML should contain transfer sent label');
    assert.ok(payerEmail.html.includes(payeeMember.attributes.name), 'Payer HTML should contain payee name');

    // Transfer card is rendered
    const transferUrl = `/groups/${groupId}/transactions/${transfer.id}`;
    assert.ok(payerEmail.html.includes(transferUrl), 'Payer HTML should contain transfer URL');
    assert.ok(payerEmail.html.includes(payerMember.attributes.name), 'HTML should contain payer member name in transfer card');

    // Text version also contains useful info
    assert.ok(payerEmail.text?.includes(payeeMember.attributes.name), 'Payer text should contain payee name');

    // Balance line is rendered
    assert.ok(payerEmail.html.includes('current balance'), 'Payer HTML should contain balance line');
    assert.ok(payeeEmail.html.includes('current balance'), 'Payee HTML should contain balance line');

    // Payee email: "received" notification
    assert.ok(
      payeeEmail.subject.includes('received'),
      `Payee subject should indicate "received". Got: "${payeeEmail.subject}"`
    );
    assert.ok(payeeEmail.html.includes('Transfer received'), 'Payee HTML should contain transfer received label');
    assert.ok(payeeEmail.html.includes(payerMember.attributes.name), 'Payee HTML should contain payer name');
    assert.ok(payeeEmail.html.includes(transferUrl), 'Payee HTML should contain transfer URL');
  });

  it('should send transfer pending email to payer', async () => {
    const { groupId, transfer, payeeUserId, payerUser, payeeMember } = setupTestTransfer();
    transfer.attributes.state = 'pending';

    const eventData = createEvent('TransferPending', transfer.id, groupId, payeeUserId, 'test-email-pending');
    await put(eventData);

    // Only payer gets the email (they need to accept/reject)
    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly 1 email for TransferPending');

    const msg = email.lastEmail();
    assert.strictEqual(msg.to, payerUser.attributes.email, 'Email should be sent to payer');

    // Subject and content
    assert.ok(
      msg.subject.toLowerCase().includes('pending'),
      `Subject should indicate pending. Got: "${msg.subject}"`
    );
    assert.ok(msg.html.includes('Transfer pending'), 'HTML should contain transfer pending label');
    assert.ok(msg.html.includes(payeeMember.attributes.name), 'HTML should contain requester (payee) name');

    // CTA is "accept or reject"
    assert.ok(
      msg.html.includes('Accept or reject'),
      'HTML should contain accept/reject CTA'
    );

    // Transfer card URL
    const transferUrl = `/groups/${groupId}/transactions/${transfer.id}`;
    assert.ok(msg.html.includes(transferUrl), 'HTML should contain transfer URL');
  });

  it('should send transfer rejected email to payee', async () => {
    const { groupId, transfer, payerUserId, payeeUser, payerMember } = setupTestTransfer();
    transfer.attributes.state = 'rejected';

    const eventData = createEvent('TransferRejected', transfer.id, groupId, payerUserId, 'test-email-rejected');
    await put(eventData);

    // Only payee gets the email
    assert.strictEqual(email.sentEmails.length, 1, 'Should send exactly 1 email for TransferRejected');

    const msg = email.lastEmail();
    assert.strictEqual(msg.to, payeeUser.attributes.email, 'Email should be sent to payee');

    // Subject and content
    assert.ok(
      msg.subject.toLowerCase().includes('rejected'),
      `Subject should indicate rejected. Got: "${msg.subject}"`
    );
    assert.ok(msg.html.includes('Transfer rejected'), 'HTML should contain transfer rejected label');
    assert.ok(msg.html.includes(payerMember.attributes.name), 'HTML should contain rejector (payer) name');

    // Transfer card URL
    const transferUrl = `/groups/${groupId}/transactions/${transfer.id}`;
    assert.ok(msg.html.includes(transferUrl), 'HTML should contain transfer URL');

    // Text version
    assert.ok(msg.text?.includes(payerMember.attributes.name), 'Text should contain rejector name');
  });

  it('should not send pending email if transfer is no longer pending', async () => {
    const { groupId, transfer, payeeUserId } = setupTestTransfer();
    // Transfer is committed (default state), not pending
    transfer.attributes.state = 'committed';

    const eventData = createEvent('TransferPending', transfer.id, groupId, payeeUserId, 'test-email-pending-skip');
    await put(eventData);

    // No email should be sent since transfer is not pending
    assert.strictEqual(email.sentEmails.length, 0, 'Should not send email when transfer is no longer pending');
  });
});
