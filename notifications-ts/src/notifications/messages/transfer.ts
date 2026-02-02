import { formatAmount } from "../../utils/format";
import { EnrichedTransferEvent } from "../enriched-events";
import { MessageContext, NotificationActions, NotificationMessage } from "./types";

/**
 * Generate message for payer when transfer is committed
 */
export const buildTransferSentMessage = (
  event: EnrichedTransferEvent,
  { t, locale }: MessageContext
): NotificationMessage => {
  const { transfer, currency, payee, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/groups/${code}/transactions/${transfer.id}`;

  return {
    title: t('notifications.transfer_sent_title'),
    body: t('notifications.transfer_sent_body', {
      amount: formatAmount(amount, currency, locale),
      recipient: payee.member.attributes.name,
    }),
    actions: [{
      title: t('notifications.action_view'),
      action: NotificationActions.OPEN_ROUTE,
    }],
    image: payee.member.attributes.image,
    route,
  };
};

/**
 * Generate message for payee when transfer is committed
 */
export const buildTransferReceivedMessage = (
  event: EnrichedTransferEvent,
  { t, locale }: MessageContext
): NotificationMessage => {
  const { transfer, currency, payer, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/groups/${code}/transactions/${transfer.id}`;

  return {
    title: t('notifications.transfer_received_title'),
    body: t('notifications.transfer_received_body', {
      amount: formatAmount(amount, currency, locale),
      sender: payer.member.attributes.name,
    }),
    actions: [{
      title: t('notifications.action_view'),
      action: NotificationActions.OPEN_ROUTE,
    }],
    image: payer.member.attributes.image,
    route,
  };
};

/**
 * Generate message for payer when transfer is pending (needs acceptance)
 */
export const buildTransferPendingMessage = (
  event: EnrichedTransferEvent,
  { t, locale }: MessageContext
): NotificationMessage | null => {
  const { transfer, currency, payee, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/${code}/transactions/${transfer.id}`;
  
  const state = transfer.attributes.state;
  if (state !== 'pending') {
    // Skip if transfer is no longer pending
    return null;
  }

  return {
    title: t('notifications.transfer_pending_title'),
    body: t('notifications.transfer_pending_body', {
      amount: formatAmount(amount, currency, locale),
      sender: payee.member.attributes.name,
    }),
    image: payee.member.attributes.image,
    route,
    actions: [{
      title: t('notifications.action_respond'),
      action: NotificationActions.OPEN_ROUTE,
    }],
    data: {
      transferId: transfer.id,
    }
  };
};

/**
 * Generate message for payee when transfer is rejected
 */
export const buildTransferRejectedMessage = (
  event: EnrichedTransferEvent,
  { t, locale }: MessageContext
): NotificationMessage => {
  const { transfer, currency, payer, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/${code}/transactions/${transfer.id}`;

  return {
    title: t('notifications.transfer_rejected_title') ,
    body: t('notifications.transfer_rejected_body', {
      amount: formatAmount(amount, currency, locale),
      name: payer.member.attributes.name,
    }),
    actions: [{
      title: t('notifications.action_view'),
      action: NotificationActions.OPEN_ROUTE,
    }],
    image: payer.member.attributes.image,
    route,
  };
};

/**
 * Generate message for payer when transfer is still pending after several days
 */
export const buildTransferStillPendingMessage = (
  event: EnrichedTransferEvent,
  { t, locale }: MessageContext
): NotificationMessage => {
  const { transfer, currency, payee, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/${code}/transactions/${transfer.id}`;

  const elapsedDays = Math.floor(
    (Date.now() - new Date(transfer.attributes.created).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    title: t('notifications.transfer_still_pending_title'),
    body: t('notifications.transfer_still_pending_body', {
      amount: formatAmount(amount, currency, locale),
      name: payee.member.attributes.name,
      duration: {
        days: elapsedDays,
      },
    }),
    actions: [{
      title: t('notifications.action_respond'),
      action: NotificationActions.OPEN_ROUTE,
    }],
    image: payee.member.attributes.image,
    route,
  };
};
