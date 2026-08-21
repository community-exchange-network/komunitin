import logger from "../../../utils/logger";
import initI18n from "../../../utils/i18n";
import prisma from "../../../utils/prisma";
import { EnrichedEvent } from "../../enriched-events";
import { MessageContext, NotificationMessage } from "../../messages";
import type { Recipient } from "../../../clients/komunitin/types";

const createNotification = async (
  event: { id: string; name: string; code: string },
  user: { id: string },
  message: NotificationMessage,
  deduplicateEvent: boolean,
) => {
  if (deduplicateEvent && await prisma.appNotification.findFirst({
    where: {
      tenantId: event.code,
      userId: user.id,
      eventId: event.id,
    },
  })) {
    return false;
  }

  const data = {
    route: message.route,
    ...(message.data),
    ...(message.actions ? {actions: message.actions} : undefined),
  }
  
  await prisma.appNotification.create({
    data: {
      tenantId: event.code,
      userId: user.id,
      eventId: event.id,
      eventName: event.name,
      title: message.title,
      body: message.body,
      image: message.image,
      data: data as any,
    },
  });
  return true;
};

export const handleNotificationForRecipients = async <T extends EnrichedEvent>(
  event: T,
  recipients: Recipient[],
  builder: (ctx: MessageContext, event: T) => NotificationMessage | null,
  deduplicateEvent = false,
) => {
  const i18n = await initI18n();
  let notificationCount = 0;
  const uniqueRecipients = new Map(recipients.map((recipient) => [recipient.user.id, recipient]));

  for (const { user } of uniqueRecipients.values()) {
    const locale = user.attributes.language || 'en';
    const t = i18n.getFixedT(locale);
    const message = builder({ t, locale }, event);

    // Skip if builder returns null (message should not be sent)
    if (!message) {
      continue;
    }

    if (await createNotification(event, user, message, deduplicateEvent)) {
      notificationCount++;
    }
  }

  logger.info(
    {
      eventId: event.id,
      eventName: event.name,
      usersCount: notificationCount,
    },
    'Created app notifications'
  );
};
