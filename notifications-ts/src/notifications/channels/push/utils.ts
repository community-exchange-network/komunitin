import logger from "../../../utils/logger";
import initI18n from "../../../utils/i18n";
import prisma from "../../../utils/prisma";
import { EnrichedEvent } from "../../enriched-events";
import { MessageContext, NotificationMessage } from "../../messages";

/**
 * Send push notifications to users with personalized, localized messages
 * 
 * This utility handles:
 * 1. Fetching push subscriptions for target users
 * 2. Generating localized messages for each user
 * 3. Sending push notifications via Web Push protocol
 * 4. Handling failed subscriptions (cleanup)
 */
export const sendPushToUsers = async <T extends EnrichedEvent>(
  event: T,
  users: Array<{ user: any; settings: any }>,
  builder: (ctx: MessageContext, event: T) => NotificationMessage | null
) => {
  const i18n = await initI18n();
  let sentCount = 0;

  for (const { user, settings } of users) {
    const locale = settings.attributes.language || 'en';
    const t = i18n.getFixedT(locale);
    const message = builder({ t, locale }, event);

    // Skip if builder returns null (message should not be sent)
    if (!message) {
      continue;
    }

    // Get all push subscriptions for this user in this tenant
    let subscriptions;
    try {
      subscriptions = await prisma.pushSubscription.findMany({
        where: {
          tenantId: event.code,
          userId: user.id,
        },
      });
    } catch (err) {
      // Database might not be available in test environment or during initialization
      logger.debug({ err }, 'Could not fetch push subscriptions');
      continue;
    }

    if (subscriptions.length === 0) {
      continue;
    }

    // Send to all subscriptions
    for (const subscription of subscriptions) {
      try {
        await sendWebPush(subscription, message, event.code);
        sentCount++;
      } catch (err: any) {
        // Handle failures (e.g., subscription expired)
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription is no longer valid - delete it
          logger.info(
            { subscriptionId: subscription.id, endpoint: subscription.endpoint },
            'Removing invalid push subscription'
          );
          try {
            await prisma.pushSubscription.delete({ where: { id: subscription.id } });
          } catch (deleteErr) {
            logger.debug({ deleteErr }, 'Could not delete invalid subscription');
          }
        } else {
          logger.error({ err, subscriptionId: subscription.id }, 'Failed to send push notification');
        }
      }
    }
  }

  if (sentCount > 0) {
    logger.info(
      {
        eventId: event.id,
        eventName: event.name,
        sentCount,
      },
      'Sent push notifications'
    );
  }
};

/**
 * Send a Web Push notification
 * 
 * TODO: Implement actual Web Push protocol
 * This requires:
 * - VAPID keys configuration
 * - web-push library integration
 * - Proper payload encryption
 */
const sendWebPush = async (
  subscription: { endpoint: string; p256dh: string; auth: string },
  message: NotificationMessage,
  tenantId: string
): Promise<void> => {
  // TODO: Implement Web Push sending
  // For now, just log what would be sent
  logger.debug(
    {
      endpoint: subscription.endpoint,
      title: message.title,
      body: message.body,
      tenantId,
    },
    'Would send push notification (not implemented yet)'
  );

  // Example implementation would look like:
  // import webpush from 'web-push';
  // 
  // const payload = JSON.stringify({
  //   title: message.title,
  //   body: message.body,
  //   icon: message.image,
  //   data: {
  //     url: message.route,
  //   },
  // });
  //
  // await webpush.sendNotification(
  //   {
  //     endpoint: subscription.endpoint,
  //     keys: {
  //       p256dh: subscription.p256dh,
  //       auth: subscription.auth,
  //     },
  //   },
  //   payload
  // );
};
