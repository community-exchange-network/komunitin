/**
 * Tests for transfer email notifications involving external transfers, where
 * one side of the transfer is an ExternalResource (account hosted on a
 * different server).
 *
 * Four scenarios are tested:
 *  1. All external data accessible (account, member, currency, group).
 *  2. All external data accessible except member.
 *  3. Only external account and currency accessible (no group, no member).
 *  4. CreditCommons address in transfer meta, external server entirely inaccessible.
 *
 * Key invariant: no email must ever be sent to the external-side user, because
 * external accounts always have an empty `users` array.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { mockEmail } from "../../mocks/email";
import { createExternalTransfer, db } from "../../mocks/db";
import { createEvent, setupNotificationsTest } from "./utils";

// mockEmail must be imported before setupNotificationsTest so that
// nodemailer.createTransport is patched before the Mailer is constructed.
const email = mockEmail();

const { put } = setupNotificationsTest({ useWorker: true });

describe("External transfer emails", () => {
  beforeEach(() => {
    email.reset();
  });

  /**
   * Helper: fire a TransferCommitted event for the given transfer and wait for
   * the worker to process it.
   */
  const fireTransferCommitted = async (
    transferId: string,
    localGroupCode: string,
    localUserId: string,
    eventId: string
  ) => {
    const eventData = createEvent(
      "TransferCommitted",
      transferId,
      localGroupCode,
      localUserId,
      eventId
    );
    await put(eventData);
  };

  // -------------------------------------------------------------------------
  // Test 1 – all external data accessible
  // -------------------------------------------------------------------------
  it("should send email to local payer when all external data is accessible", async () => {
    const { transfer, localGroupCode, localUser, externalGroupCode } =
      createExternalTransfer({
        localGroupCode: "GRP1",
        externalGroupCode: "EXTA",
        externalAccountAccessible: true,
        externalCurrencyAccessible: true,
        externalMemberAccessible: true,
        externalGroupAccessible: true,
      });

    await fireTransferCommitted(
      transfer.id,
      localGroupCode,
      localUser.id,
      "test-ext-all-accessible"
    );

    // Only 1 email: to the local payer. The external payee has users:[] so
    // no email should reach any external address.
    assert.strictEqual(
      email.sentEmails.length,
      1,
      "Should send exactly 1 email (local payer only)"
    );

    const msg = email.sentEmails[0];
    assert.strictEqual(
      msg.to,
      localUser.attributes.email,
      "Email must be addressed to the local user"
    );

    // The external member's name must appear in the transfer card.
    const externalMemberName = `External Member ${externalGroupCode}`;
    assert.ok(
      msg.html.includes(externalMemberName),
      `HTML should contain external member name "${externalMemberName}"`
    );

    // Both local and external group names must appear in the transfer card.
    assert.ok(
      msg.html.includes("Group GRP1"),
      "HTML should contain local group name 'Group GRP1'"
    );
    assert.ok(
      msg.html.includes(`Group ${externalGroupCode}`),
      `HTML should contain external group name "Group ${externalGroupCode}"`
    );

    // otherAmount must appear: both currencies have the same rate so the EXT
    // symbol suffices as a proxy for the formatted amount being present.
    assert.ok(
      msg.html.includes("EXT"),
      "HTML should contain external currency symbol for otherAmount"
    );

    // No email must go to any address that is not the local user's.
    for (const sent of email.sentEmails) {
      assert.strictEqual(
        sent.to,
        localUser.attributes.email,
        "All emails must only go to the local user"
      );
    }
  });

  // -------------------------------------------------------------------------
  // Test 2 – all external data accessible except member
  // -------------------------------------------------------------------------
  it("should send email to local payer when external member is not accessible", async () => {
    const { transfer, localGroupCode, localUser, externalGroupCode } =
      createExternalTransfer({
        localGroupCode: "GRP1",
        externalGroupCode: "EXTB",
        externalAccountAccessible: true,
        externalCurrencyAccessible: true,
        externalMemberAccessible: false,
        externalGroupAccessible: true,
      });

    await fireTransferCommitted(
      transfer.id,
      localGroupCode,
      localUser.id,
      "test-ext-no-member"
    );

    assert.strictEqual(
      email.sentEmails.length,
      1,
      "Should send exactly 1 email (local payer only)"
    );

    const msg = email.sentEmails[0];
    assert.strictEqual(msg.to, localUser.attributes.email);

    // Without a member the display falls back to the account code.
    const externalAccountCode = `ext-user-${externalGroupCode.toLowerCase()}`;
    assert.ok(
      msg.html.includes(externalAccountCode),
      `HTML should contain external account code "${externalAccountCode}" as display name`
    );

    // Member name must NOT appear.
    assert.ok(
      !msg.html.includes(`External Member ${externalGroupCode}`),
      "HTML must not contain member name when member is inaccessible"
    );

    // Local and external group names must still appear.
    assert.ok(
      msg.html.includes("Group GRP1"),
      "HTML should contain local group name 'Group GRP1'"
    );
    assert.ok(
      msg.html.includes(`Group ${externalGroupCode}`),
      `HTML should contain external group name "Group ${externalGroupCode}"`
    );

    // otherAmount must appear (EXT currency is accessible).
    assert.ok(
      msg.html.includes("EXT"),
      "HTML should contain external currency symbol for otherAmount"
    );

    // No email to external addresses.
    assert.strictEqual(email.sentEmails.length, 1);
  });

  // -------------------------------------------------------------------------
  // Test 3 – only external account and currency accessible (no group, no member)
  // -------------------------------------------------------------------------
  it("should send email to local payer when only external account and currency are accessible", async () => {
    const { transfer, localGroupCode, localUser, externalGroupCode } =
      createExternalTransfer({
        localGroupCode: "GRP1",
        externalGroupCode: "EXTC",
        externalAccountAccessible: true,
        externalCurrencyAccessible: true,
        externalMemberAccessible: false,
        externalGroupAccessible: false,
      });

    await fireTransferCommitted(
      transfer.id,
      localGroupCode,
      localUser.id,
      "test-ext-account-currency-only"
    );

    assert.strictEqual(
      email.sentEmails.length,
      1,
      "Should send exactly 1 email (local payer only)"
    );

    const msg = email.sentEmails[0];
    assert.strictEqual(msg.to, localUser.attributes.email);

    // With no member, display falls back to external account code.
    const externalAccountCode = `ext-user-${externalGroupCode.toLowerCase()}`;
    assert.ok(
      msg.html.includes(externalAccountCode),
      `HTML should contain external account code "${externalAccountCode}" as display name`
    );

    // Local group name appears; external group is inaccessible, so the currency
    // fallback label should appear instead.
    assert.ok(
      msg.html.includes("Group GRP1"),
      "HTML should contain local group name 'Group GRP1'"
    );
    const extCurrencyFallback = `${externalGroupCode} Currency (EXT)`;
    assert.ok(
      msg.html.includes(extCurrencyFallback),
      `HTML should contain currency fallback "${extCurrencyFallback}" when group is inaccessible`
    );
    assert.ok(
      !msg.html.includes(`Group ${externalGroupCode}`),
      "HTML must not contain external group object name when group is inaccessible"
    );

    // otherAmount must still appear (external currency IS accessible).
    assert.ok(
      msg.html.includes("EXT"),
      "HTML should contain external currency symbol for otherAmount"
    );

    // No email to external addresses.
    assert.strictEqual(email.sentEmails.length, 1);
  });

  // -------------------------------------------------------------------------
  // Test 4 – CreditCommons address meta, external server entirely inaccessible
  // -------------------------------------------------------------------------
  it("should send email to local payer using creditCommons address when external server is inaccessible", async () => {
    const ccPayeeAddress = "extd.example.net/payee-cc-address";

    const { transfer, localGroupCode, localUser } = createExternalTransfer({
      localGroupCode: "GRP1",
      externalGroupCode: "EXTD",
      externalAccountAccessible: false,
      externalCurrencyAccessible: false,
      externalMemberAccessible: false,
      externalGroupAccessible: false,
      creditCommonsPayeeAddress: ccPayeeAddress,
    });

    await fireTransferCommitted(
      transfer.id,
      localGroupCode,
      localUser.id,
      "test-ext-cc-nothing-accessible"
    );

    assert.strictEqual(
      email.sentEmails.length,
      1,
      "Should send exactly 1 email (local payer only)"
    );

    const msg = email.sentEmails[0];
    assert.strictEqual(msg.to, localUser.attributes.email);

    // The CreditCommons payee address must appear as the payee display name.
    assert.ok(
      msg.html.includes(ccPayeeAddress),
      `HTML should contain creditCommons payee address "${ccPayeeAddress}"`
    );

    // Local group should still be shown for the local payer side.
    assert.ok(
      msg.html.includes("Group GRP1"),
      "HTML should contain local group name 'Group GRP1'"
    );

    // No otherAmount: external currency is entirely inaccessible.
    // Verify the external currency symbol does NOT appear in the amount section.
    // (EXT is the currency symbol for all external test currencies, but EXTD is
    //  inaccessible, so "EXT" must not appear anywhere.)
    assert.ok(
      !msg.html.includes(">EXT"),
      "HTML must not contain external currency symbol when currency is inaccessible"
    );

    // No email to external addresses.
    assert.strictEqual(email.sentEmails.length, 1);
  });
});
