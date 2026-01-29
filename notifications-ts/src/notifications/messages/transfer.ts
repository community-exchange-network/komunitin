import { formatAmount } from "../../utils/format";
import { EnrichedTransferEvent } from "../enriched-events";
import { MessageContext, NotificationMessage } from "./types";

/**
 * Generate message for payer when transfer is committed
 */
export const buildTransferSentMessage = (
  event: EnrichedTransferEvent,
  ctx: MessageContext
): NotificationMessage => {
  const { transfer, currency, payee, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/groups/${code}/transactions/${transfer.id}`;

  return {
    title: ctx.t('notifications.transfer_sent_title') as string,
    body: ctx.t('notifications.transfer_sent_body', {
      amount: formatAmount(amount, currency, ctx.locale),
      recipient: payee.member.attributes.name,
    }) as string,
    image: payee.member.attributes.image,
    route,
  };
};

/**
 * Generate message for payee when transfer is committed
 */
export const buildTransferReceivedMessage = (
  event: EnrichedTransferEvent,
  ctx: MessageContext
): NotificationMessage => {
  const { transfer, currency, payer, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/groups/${code}/transactions/${transfer.id}`;

  return {
    title: ctx.t('notifications.transfer_received_title') as string,
    body: ctx.t('notifications.transfer_received_body', {
      amount: formatAmount(amount, currency, ctx.locale),
      sender: payer.member.attributes.name,
    }) as string,
    image: payer.member.attributes.image,
    route,
  };
};

/**
 * Generate message for payer when transfer is pending (needs acceptance)
 */
export const buildTransferPendingMessage = (
  event: EnrichedTransferEvent,
  ctx: MessageContext
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
    title: ctx.t('notifications.transfer_pending_title') as string,
    body: ctx.t('notifications.transfer_pending_body', {
      amount: formatAmount(amount, currency, ctx.locale),
      sender: payee.member.attributes.name,
    }) as string,
    image: payee.member.attributes.image,
    route,
  };
};

/**
 * Generate message for payee when transfer is rejected
 */
export const buildTransferRejectedMessage = (
  event: EnrichedTransferEvent,
  ctx: MessageContext
): NotificationMessage => {
  const { transfer, currency, payer, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/${code}/transactions/${transfer.id}`;

  return {
    title: ctx.t('notifications.transfer_rejected_title') as string,
    body: ctx.t('notifications.transfer_rejected_body', {
      amount: formatAmount(amount, currency, ctx.locale),
      name: payer.member.attributes.name,
    }) as string,
    image: payer.member.attributes.image,
    route,
  };
};

/**
 * Generate message for payer when transfer is still pending after several days
 */
export const buildTransferStillPendingMessage = (
  event: EnrichedTransferEvent,
  ctx: MessageContext
): NotificationMessage => {
  const { transfer, currency, payee, code } = event;
  const amount = transfer.attributes.amount;
  const route = `/${code}/transactions/${transfer.id}`;

  const elapsedDays = Math.floor(
    (Date.now() - new Date(transfer.attributes.created).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    title: ctx.t('notifications.transfer_still_pending_title'),
    body: ctx.t('notifications.transfer_still_pending_body', {
      amount: formatAmount(amount, currency, ctx.locale),
      name: payee.member.attributes.name,
      days: elapsedDays,
      count: elapsedDays,
    }),
    image: payee.member.attributes.image,
    route,
  };
};
