import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { createExternalTransfer } from "../../mocks/db";
import { createEvent, setupNotificationsTest } from "./utils";

const { put, appNotifications } = setupNotificationsTest({
  useWorker: true,
  usePushQueue: true,
  useSyntheticQueue: true,
});

describe("External transfer in-app notifications", () => {
  beforeEach(() => {
    appNotifications.length = 0;
  });

  const fireTransferCommitted = async (
    transferId: string,
    localGroupCode: string,
    localUserId: string,
    eventId: string,
  ) => {
    const eventData = createEvent(
      "TransferCommitted",
      transferId,
      localGroupCode,
      localUserId,
      eventId,
    );
    await put(eventData);
  };

  it("adds external group name when external member is accessible", async () => {
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
      "test-app-ext-all-accessible",
    );

    assert.strictEqual(appNotifications.length, 1);
    const notification = appNotifications[0];

    assert.strictEqual(notification.userId, localUser.id);
    assert.strictEqual(notification.title, "Transfer sent");
    assert.ok(
      notification.body.includes(`External Member ${externalGroupCode} (Group ${externalGroupCode})`),
      "Body should include external member name with external group reference",
    );
  });

  it("falls back to account code and external group name when member is not accessible", async () => {
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
      "test-app-ext-no-member",
    );

    assert.strictEqual(appNotifications.length, 1);
    const notification = appNotifications[0];
    const externalAccountCode = `ext-user-${externalGroupCode.toLowerCase()}`;

    assert.strictEqual(notification.userId, localUser.id);
    assert.ok(
      notification.body.includes(`${externalAccountCode} (Group ${externalGroupCode})`),
      "Body should include account code with external group reference",
    );
  });

  it("falls back to account code and currency label when group is not accessible", async () => {
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
      "test-app-ext-account-currency-only",
    );

    assert.strictEqual(appNotifications.length, 1);
    const notification = appNotifications[0];
    const externalAccountCode = `ext-user-${externalGroupCode.toLowerCase()}`;

    assert.strictEqual(notification.userId, localUser.id);
    assert.ok(
      notification.body.includes(`${externalAccountCode} (${externalGroupCode} Currency (EXT))`),
      "Body should include account code with currency fallback reference",
    );
  });

  it("falls back to creditCommons address when external side is inaccessible", async () => {
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
      "test-app-ext-cc-nothing-accessible",
    );

    assert.strictEqual(appNotifications.length, 1);
    const notification = appNotifications[0];

    assert.strictEqual(notification.userId, localUser.id);
    assert.ok(
      notification.body.includes(ccPayeeAddress),
      "Body should include creditCommons payee address",
    );
    assert.ok(
      !notification.body.includes("(Group "),
      "Body should not include a group suffix when group is inaccessible",
    );
  });
});
