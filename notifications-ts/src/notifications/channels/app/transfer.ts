import { formatAmount } from "../../../utils/format";
import { EnrichedEvent, EnrichedTransferEvent } from "../../enriched-events";
import { handleNotificationForUsers } from "./utils";

export const handleTransferCommitted = async (event: EnrichedTransferEvent): Promise<void> => {
  const { transfer, currency, payer, payee, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/${code}/transactions/${transfer.id}`;

  // Notify payer users
  await handleNotificationForUsers(event, payer.users, ({ t, locale }) => ({
    title: t('notifications.transfer_sent_title') as string,
    body: t('notifications.transfer_sent_body', {
      amount: formatAmount(amount, currency, locale),
      recipient: payee.member.attributes.name,
    }) as string,
    image: payee.member.attributes.image,
    route,
  }));

  // Notify payee users
  await handleNotificationForUsers(event, payee.users, ({ t, locale }) => ({
    title: t('notifications.transfer_received_title') as string,
    body: t('notifications.transfer_received_body', {
      amount: formatAmount(amount, currency, locale),
      sender: payer.member.attributes.name,
    }) as string,
    image: payer.member.attributes.image,
    route,
  }));
};

export const handleTransferPending = async (event: EnrichedEvent & {
  group: any;
  currency: any;
  transfer: any;
  payer: { account: any; member: any; users: Array<{ user: any; settings: any }> };
  payee: { account: any; member: any; users: Array<{ user: any; settings: any }> };
}): Promise<void> => {
  const { transfer, currency, payer, payee, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/${code}/transactions/${transfer.id}`;

  // Notify payer users (they need to accept/reject)
  await handleNotificationForUsers(event, payer.users, ({ t, locale }) => ({
    title: t('notifications.transfer_pending_title') as string,
    body: t('notifications.transfer_pending_body', {
      amount: formatAmount(amount, currency, locale),
      sender: payee.member.attributes.name,
    }) as string,
    image: payee.member.attributes.image,
    route,
  }));
};

export const handleTransferRejected = async (event: EnrichedTransferEvent): Promise<void> => {
  const { transfer, currency, payer, payee, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/${code}/transactions/${transfer.id}`;

  // Notify payee users (the one who requested the transfer)
  await handleNotificationForUsers(event, payee.users, ({ t, locale }) => ({
    title: t('notifications.transfer_rejected_title') as string,
    body: t('notifications.transfer_rejected_body', {
      amount: formatAmount(amount, currency, locale),
      name: payer.member.attributes.name,
    }) as string,
    image: payer.member.attributes.image,
    route,
  }));
};
