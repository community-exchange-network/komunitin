import logger from "../../../utils/logger";
import { i18n } from "i18next";
import initI18n from "../../../utils/i18n";
import prisma from "../../../utils/prisma";
import { EnrichedEvent } from "../../enriched-events";
import { MessageContext } from "../../messages";

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

export const handleNotificationForUsers = async <T extends EnrichedEvent>(
  event: T,
  users: Array<{ user: any; settings: any }>,
  builder: (ctx: MessageContext, event: T) => { title: string; body: string; image: string | undefined; route: string } | null
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

    const { title, body, image, route } = message;

    await createNotification(
      event,
      user,
      { title, body, image },
      route
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