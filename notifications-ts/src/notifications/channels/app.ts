import { eventBus } from '../event-bus';
import { EVENT_NAME } from '../events';
import { EnrichedEvent, EnrichedTransferEvent } from '../enriched-events';
import logger from '../../utils/logger';
import prisma from '../../utils/prisma';
import initI18n from '../../utils/i18n';
import { formatAmount } from '../../utils/format';
import { i18n } from 'i18next';

export const initInAppChannel = (): (() => void) => {
  logger.info('Initializing in-app notification channel');

  // Subscribe to transfer events and collect unsubscribe functions
  const unsubscribers = [
    eventBus.on(EVENT_NAME.TransferCommitted, handleTransferCommitted),
    eventBus.on(EVENT_NAME.TransferPending, handleTransferPending),
    eventBus.on(EVENT_NAME.TransferRejected, handleTransferRejected),
  ];
  // TODO: Implement handlers for other events
  // eventBus.on(EVENT_NAME.NeedPublished, handleNeedPublished);
  // eventBus.on(EVENT_NAME.NeedExpired, handleNeedExpired);
  // eventBus.on(EVENT_NAME.OfferPublished, handleOfferPublished);
  // eventBus.on(EVENT_NAME.OfferExpired, handleOfferExpired);
  // eventBus.on(EVENT_NAME.MemberJoined, handleMemberJoined);
  // eventBus.on(EVENT_NAME.MemberRequested, handleMemberRequested);
  // eventBus.on(EVENT_NAME.GroupRequested, handleGroupRequested);
  // eventBus.on(EVENT_NAME.GroupActivated, handleGroupActivated);

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};


const createNotification = async (
  event: { id: string; name: string; code: string },
  user: { id: string },
  content: { title: string; body: string; image: string | undefined },
  route: string
) => {
  await prisma.appNotification.create({
    data: {
      tenantId: event.code,
      userId: user.id,
      eventId: event.id,
      eventName: event.name,
      title: content.title,
      body: content.body,
      image: content.image,
      data: {
        route,
      },
    },
  });
};

const handleNotificationForUsers = async <T extends EnrichedEvent>(
  event: T,
  users: Array<{ user: any; settings: any }>,
  builder: (ctx: { t: ReturnType<i18n['getFixedT']>; locale: string }, event: T) => { title: string; body: string; image: string | undefined; route: string }
) => {
  const i18n = await initI18n();

  for (const { user, settings } of users) {
    const locale = settings.attributes.language || 'en';
    const t = i18n.getFixedT(locale);
    const { title, body, image, route } = builder({ t, locale }, event);

    await createNotification(
      event,
      user,
      { title, body, image },
      route
    );
  }

  logger.info(
    {
      eventId: event.id,
      eventName: event.name,
      usersCount: users.length,
    },
    'Created app notifications'
  );
};

const handleTransferCommitted = async (event: EnrichedTransferEvent): Promise<void> => {
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

const handleTransferPending = async (event: EnrichedEvent & {
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

const handleTransferRejected = async (event: EnrichedTransferEvent): Promise<void> => {
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
