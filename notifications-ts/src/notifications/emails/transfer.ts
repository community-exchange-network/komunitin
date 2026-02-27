import { Account, Currency } from "../../clients/komunitin/types";
import { formatAmount, formatDate } from "../../utils/format";
import { EnrichedTransferEvent } from "../enriched-events";
import { type MessageContext } from "../messages";
import { getTransferPartyGroupName, getTransferPartyName, isExternalTransfer, isExternalTransferSide } from "../messages/transfer-members";
import { EmailTemplateContext, TransferTemplateContext, TransferTemplateMember } from "./types";
import { ctxCommon } from "./utils";

// -- Colors matching the web app --

// Amount colors
const POSITIVE_AMOUNT_COLOR = '#72A310'; // $primary (green)
const NEGATIVE_AMOUNT_COLOR = '#2f7989'; // $kblue

// Status pill colors (matching PillBadge in the Vue app)
const STATUS_COLORS: Record<string, { color: string; bgColor: string }> = {
  new:       { color: '#01579B', bgColor: '#E1F5FE' }, // light-blue
  pending:   { color: '#E65100', bgColor: '#FFF3E0' }, // orange
  accepted:  { color: '#004D40', bgColor: '#E0F2F1' }, // teal
  committed: { color: '#1B5E20', bgColor: '#E8F5E9' }, // green
  rejected:  { color: '#B71C1C', bgColor: '#FFEBEE' }, // red
  failed:    { color: '#BF360C', bgColor: '#FBE9E7' }, // deep-orange
  deleted:   { color: '#212121', bgColor: '#F5F5F5' }, // grey
};

// -- Helpers --

/**
 * Convert a transfer amount from the local currency to another currency,
 * using the exchange rates stored on each currency (both expressed against
 * a common base).
 */
const convertAmount = (amount: number, from: Currency, to: Currency): number =>
  amount * (from.attributes.rate.n / from.attributes.rate.d) * (to.attributes.rate.d / to.attributes.rate.n);

/**
 * Build the group badge shown on each side of the transfer card.
 *  - Returns undefined for internal (same-community) transfers.
 *  - For the local side: use the local group data (never null).
 *  - For the external side: prefer the fetched group object; fall back to the
 *    currency name + symbol when the group is unavailable, or omit entirely
 *    when neither is accessible.
 */
const buildTransferMemberGroup = (
  event: EnrichedTransferEvent,
  who: "payer" | "payee",
): TransferTemplateMember['group'] => {
  // Only cross-community transfers get group badges.
  if (!isExternalTransfer(event)) {
    return undefined;
  }

  const side = event[who];
  const name = getTransferPartyGroupName(event, who);

  if (!name) {
    // No group name available at all, dont show badge.
    return undefined;
  }

  return {
    name,
    image: side.group?.attributes.image ?? undefined,
    initial: name.charAt(0).toUpperCase(),
  };
};

const buildTransferMember = (event: EnrichedTransferEvent, who: "payer" | "payee"): TransferTemplateMember => {
  const account = event[who].account;
  const member = event[who].member;
  const name = getTransferPartyName(event, who);
  const code = member && 'attributes' in account ? account.attributes.code : "";

  return {
    name,
    code,
    image: member?.attributes.image ?? undefined,
    initial: name.charAt(0).toUpperCase(),
    group: buildTransferMemberGroup(event, who),
  }
};

const buildTransferCard = (
  event: EnrichedTransferEvent,
  ctx: MessageContext,
  isPositive: boolean,
): TransferTemplateContext => {
  const { transfer, currency, payer, payee } = event;
  const { t, locale } = ctx;

  const meta = transfer.attributes.meta as unknown as { description?: string } | undefined;
  const description = (typeof meta === 'object' && meta?.description) ? meta.description : '';
  const state = transfer.attributes.state;
  const statusColors = STATUS_COLORS[state] ?? STATUS_COLORS['committed'];

  // Compute otherAmount: amount expressed in the external (non-local) currency.
  const externalCurrency = [payer.currency,payee.currency].find(c => c && c.id !== currency.id);
  const otherAmount = externalCurrency
    ? formatAmount(convertAmount(transfer.attributes.amount, currency, externalCurrency), externalCurrency, locale)
    : undefined;

  return {
    description,
    amount: formatAmount(transfer.attributes.amount, currency, locale),
    amountColor: isPositive ? POSITIVE_AMOUNT_COLOR : NEGATIVE_AMOUNT_COLOR,
    otherAmount,
    payer: buildTransferMember(event, "payer"),
    payee: buildTransferMember(event, "payee"),
    date: formatDate(transfer.attributes.updated ?? transfer.attributes.created, locale),
    status: {
      label: t(`emails.transfer_state_${state}`),
      color: statusColors.color,
      bgColor: statusColors.bgColor,
    },
  };
};

const transferRoute = (code: string, transferId: string): string => {
  return `/groups/${code}/transactions/${transferId}`;
};

const buildBalanceLine = (
  balance: number,
  currency: EnrichedTransferEvent['currency'],
  ctx: MessageContext,
): { html: string } => {
  const { t, locale } = ctx;
  const formatted = formatAmount(balance, currency, locale);
  const color = balance >= 0 ? POSITIVE_AMOUNT_COLOR : NEGATIVE_AMOUNT_COLOR;
  const coloredAmount = `<span style="color: ${color};">${formatted}</span>`;
  const html = t('emails.current_balance', { balance: coloredAmount, interpolation: { escapeValue: false } });
  return { html };
};

// -- Context builders for 4 transfer email scenarios --

/**
 * Email context for the payer when a transfer is committed.
 */
export const ctxTransferSent = (
  event: EnrichedTransferEvent,
  ctx: MessageContext,
): EmailTemplateContext => {
  const { t, locale } = ctx;
  const common = ctxCommon(event, ctx);
  const { transfer, currency, payer, code } = event;
  const amount = formatAmount(transfer.attributes.amount, currency, locale);

  const transferCard = buildTransferCard(event, ctx, false);

  return {
    ...common,
    subject: t('emails.transfer_sent_subject', { amount }),
    label: { icon: '🙏', iconBg: '#E8F5E9', text: t('emails.transfer_sent_label') },
    greeting: t('emails.hello_name', { name: payer.member!.attributes.name }),
    paragraphs: [t('emails.transfer_sent_text', { amount, recipient: transferCard.payee.name })],
    transfer: transferCard,
    cta: { main: { text: t('emails.transfer_view_cta'), url: `${common.appUrl}${transferRoute(code, transfer.id)}` } },
    balanceLine: buildBalanceLine((payer.account as Account).attributes.balance, currency, ctx),
  };
};

/**
 * Email context for the payee when a transfer is committed.
 */
export const ctxTransferReceived = (
  event: EnrichedTransferEvent,
  ctx: MessageContext,
): EmailTemplateContext => {
  const { t, locale } = ctx;
  const common = ctxCommon(event, ctx);
  const { transfer, currency, payee, code } = event;
  const amount = formatAmount(transfer.attributes.amount, currency, locale);

  const transferCard = buildTransferCard(event, ctx, true);

  return {
    ...common,
    subject: t('emails.transfer_received_subject', { amount }),
    label: { icon: '🎉', iconBg: '#E8F5E9', text: t('emails.transfer_received_label') },
    greeting: t('emails.hello_name', { name: payee.member!.attributes.name }),
    paragraphs: [t('emails.transfer_received_text', { amount, sender: transferCard.payer.name })],
    transfer: transferCard,
    cta: { main: { text: t('emails.transfer_view_cta'), url: `${common.appUrl}${transferRoute(code, transfer.id)}` } },
    balanceLine: buildBalanceLine((payee.account as Account).attributes.balance, currency, ctx),
  };
};

/**
 * Email context for the payer when a transfer is pending (needs acceptance).
 */
export const ctxTransferPending = (
  event: EnrichedTransferEvent,
  ctx: MessageContext,
): EmailTemplateContext | null => {
  const { t, locale } = ctx;
  const common = ctxCommon(event, ctx);
  const { transfer, currency, payer, payee, code } = event;

  if (transfer.attributes.state !== 'pending') {
    return null;
  }

  const amount = formatAmount(transfer.attributes.amount, currency, locale);
  const transferCard = buildTransferCard(event, ctx, false);

  return {
    ...common,
    subject: t('emails.transfer_pending_subject'),
    label: { icon: '⏳', iconBg: '#FFF3E0', text: t('emails.transfer_pending_label') },
    greeting: t('emails.hello_name', { name: payer.member!.attributes.name }),
    paragraphs: [
      t('emails.transfer_pending_text', { amount, sender: transferCard.payee.name }),
      t('emails.transfer_pending_subtext'),
    ],
    transfer: transferCard,
    cta: { main: { text: t('emails.transfer_respond_cta'), url: `${common.appUrl}${transferRoute(code, transfer.id)}` } },
    balanceLine: buildBalanceLine((payer.account as Account).attributes.balance, currency, ctx),
  };
};

/**
 * Email context for the payee when a transfer is rejected.
 */
export const ctxTransferRejected = (
  event: EnrichedTransferEvent,
  ctx: MessageContext,
): EmailTemplateContext => {
  const { t, locale } = ctx;
  const common = ctxCommon(event, ctx);
  const { transfer, currency, payer, payee, code } = event;
  const amount = formatAmount(transfer.attributes.amount, currency, locale);

  const transferCard = buildTransferCard(event, ctx, false);

  return {
    ...common,
    subject: t('emails.transfer_rejected_subject'),
    label: { icon: '❌', iconBg: '#FFEBEE', text: t('emails.transfer_rejected_label') },
    greeting: t('emails.hello_name', { name: payee.member!.attributes.name }),
    paragraphs: [
      t('emails.transfer_rejected_text', { amount, name: transferCard.payer.name }),
      t('emails.transfer_rejected_subtext'),
    ],
    transfer: transferCard,
    cta: { main: { text: t('emails.transfer_view_cta'), url: `${common.appUrl}${transferRoute(code, transfer.id)}` } },
    balanceLine: buildBalanceLine((payee.account as Account).attributes.balance, currency, ctx),
  };
};
