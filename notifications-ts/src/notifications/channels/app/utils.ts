import logger from "../../../utils/logger";
import initI18n from "../../../utils/i18n";
import prisma from "../../../utils/prisma";
import { EnrichedEvent } from "../../enriched-events";
import { MessageContext, NotificationMessage } from "../../messages";

const createNotification = async (
  event: { id: string; name: string; code: string },
  user: { id: string },
  message: NotificationMessage
) => {
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
};

export const handleNotificationForUsers = async <T extends EnrichedEvent>(
  event: T,
  users: Array<{ user: any; settings: any }>,
  builder: (ctx: MessageContext, event: T) => NotificationMessage | null
) => {
  const i18n = await initI18n();
  let notificationCount = 0;

  for (const { user, settings } of users) {
    const locale = settings.attributes.language || 'en';
    const t = i18n.getFixedT(locale);
    const message = builder({ t, locale }, event);

    // Skip if builder returns null (message should not be sent)
    if (!message) {
      continue;
    }

    await createNotification(
      event,
      user,
      message
    );
    notificationCount++;
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