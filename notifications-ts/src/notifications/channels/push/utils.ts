import logger from "../../../utils/logger";
import initI18n, { localTime } from "../../../utils/i18n";
import prisma from "../../../utils/prisma";
import { EnrichedEvent } from "../../enriched-events";
import { MessageContext, NotificationMessage } from "../../messages";
import { createQueue, createWorker } from "../../../utils/queue";
import { Queue } from "bullmq";
import { User, UserSettings } from "../../../clients/komunitin/types";
import { getCachedActiveGroups, getCachedGroupMembersWithUsers } from "../../../utils/cached-resources";
import { KomunitinClient } from "../../../clients/komunitin/client";
import tz from '@photostructure/tz-lookup';
import { Prisma, PushSubscription } from '@prisma/client';
import webpush from 'web-push';
import { config } from "../../../config";
import { internalError } from "../../../utils/error";

const QUEUE_NAME = 'push-notifications';
const JOB_NAME_SEND_PUSH = 'send-push-notification';
let queue: Queue | null = null;

export type PushPriority = 'high' | 'normal';
export type NotificationClass = 'account' | 'group';


export const initPushChannel = async () => {
  logger.info('Initializing push notification channel');
  queue = createQueue(QUEUE_NAME);
  const worker = createWorker(QUEUE_NAME, async (job) => {
    // Send the push notification using Web Push protocol
    if (job.name === JOB_NAME_SEND_PUSH) {
      const { subscription, message, code, subscriptionId, userId, eventId } = job.data;
      await sendWebPush(subscription, message, code, { subscriptionId, userId, eventId });
    } else {
      logger.warn({ jobName: job.name }, 'No handler registered for job');
    }
  })

  return () => worker.close();
}

const getUserTimezone = async (user: User, settings: UserSettings, groupCode: string): Promise<string | null> => {
  // Ideally we should have the TZ in user settings, but this is not the case (yet).
  // We can however guess it from their known location (member coordinates) or group location.
  const client = new KomunitinClient();
  const members = await getCachedGroupMembersWithUsers(client, groupCode, Infinity);
  const member = members.find(mwu => mwu.users.some(u => u.user.id === user.id))?.member;
  let coordinates = member?.attributes.location?.coordinates
  if (!coordinates || coordinates.length !== 2 || coordinates[0] === 0 && coordinates[1] === 0) {
    // Fallback to group coordinates
    const groups = await getCachedActiveGroups(client, Infinity);
    const group = groups.find(g => g.attributes.code === groupCode);
    coordinates = group?.attributes.location?.coordinates;
  }
  if (!coordinates || coordinates.length !== 2 || coordinates[0] === 0 && coordinates[1] === 0) {
    return null;
  }
  try {
    const timezone = tz(coordinates[1], coordinates[0]); // lat, lon, reverse order from GeoJSON
    return timezone;
  } catch (err) {
    logger.warn({ err, userId: user.id }, 'Failed to get timezone from coordinates');
    return null;
  }
}

const shouldSendPushNotificationToUser = (notificationClass: NotificationClass, settings: UserSettings): boolean => {
  // Check user settings to see if they allow this class of notifications
  if (notificationClass === 'account') {
    return settings.attributes.notifications.myAccount;
  } else if (notificationClass === 'group') {
    return settings.attributes.notifications.newNeeds ||
           settings.attributes.notifications.newOffers ||
           settings.attributes.notifications.newMembers;
  }
  return false;
}

const QUIET_HOURS_START = 22; // 10 PM
const QUIET_HOURS_END = 8;    // 8 AM

const pushNotificationDelay = (priority: PushPriority, timezone: string | null): number => {
  if (priority === 'high') {
    return 0; // immediate
  }
  if (timezone === null) {
    return 0; // no timezone info, send immediately
  }
  // respect fixed quiet hours for normal priority
  const localDate = localTime(timezone);
  const currentHour = localDate.getHours();
  const currentMinutes = localDate.getMinutes();
  if (currentHour >= QUIET_HOURS_START || currentHour < QUIET_HOURS_END) {
    // Eg: if 5:45 AM, delayHours = 2, delayMinutes = 15.
    const delayHours = (QUIET_HOURS_END - currentHour - 1 + 24) % 24;
    const delayMinutes = (60 - currentMinutes) % 60; // minutes to next hour
    const minutesUntilEnd = delayHours * 60 + delayMinutes
    // add up to 15 min random delay
    const totalDelayMinutes = minutesUntilEnd + Math.random() * 15;
    return totalDelayMinutes * 60 * 1000; // convert to ms
  }
  return 0; // no delay
}
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
  users: Array<{ user: User; settings: UserSettings }>,
  builder: (ctx: MessageContext, event: T) => NotificationMessage | null,
  notificationClass: NotificationClass,
  priority: PushPriority = 'normal'
) => {
  const i18n = await initI18n();

  for (const { user, settings } of users) {
    const locale = settings.attributes.language || 'en';
    const t = i18n.getFixedT(locale);

    // build message for this user
    const message = builder({ t, locale }, event);

    // Skip if builder returns null (message should not be sent)
    if (!message) {
      continue;
    }
    // Get all push subscriptions for this user in this tenant
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        tenantId: event.code,
        userId: user.id,
      },
    });

    if (subscriptions.length === 0) {
      continue;
    }

    if (!shouldSendPushNotificationToUser(notificationClass, settings)) {
      continue;
    }

    const timezone = await getUserTimezone(user, settings, event.code);
    const delay = pushNotificationDelay(priority, timezone);

    // Send to all subscriptions
    for (const subscription of subscriptions) {
      await queueWebPush(subscription, message, event.code, delay, { userId: user.id, eventId: event.id });
    }
  }
};

const queueWebPush = async (
  subscription: PushSubscription,
  message: NotificationMessage,
  groupCode: string,
  delay: number,
  meta: { userId: string; eventId: string }
): Promise<void> => {
  if (!queue) {
    throw new Error('Push notification queue not initialized');
  }
  await queue.add(
    JOB_NAME_SEND_PUSH,
    {
      subscription: {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      message,
      code: groupCode,
      subscriptionId: subscription.id,
      userId: meta.userId,
      eventId: meta.eventId,
    },
    {
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60*1000, // initial delay 1min
      },
      removeOnComplete: true,
    }
  );
}

/**
 * Send a Web Push notification
 * 
 */
const sendWebPush = async (
  subscription: { endpoint: string; p256dh: string; auth: string },
  message: NotificationMessage,
  tenantId: string,
  meta: { subscriptionId: string; userId: string; eventId: string }
): Promise<void> => {
  const vapidPublicKey = config.PUSH_NOTIFICATIONS_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = config.PUSH_NOTIFICATIONS_VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    logger.error('Missing VAPID keys for push notifications');
    return;
  }

  if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) {
    logger.error({ subscription, tenantId }, 'Invalid push subscription data');
    return;
  }
  
  const subjectEmail = () => {
    const matched = config.APP_EMAIL?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (!matched || matched.length === 0) {
      throw internalError(`Invalid APP_EMAIL: ${config.APP_EMAIL}`);
    }
    return `mailto:${matched[0]}`;
  }

  webpush.setVapidDetails(subjectEmail(), vapidPublicKey, vapidPrivateKey);

  const pushNotification = await prisma.pushNotification.create({
    data: {
      tenantId,
      userId: meta.userId,
      subscriptionId: meta.subscriptionId,
      eventId: meta.eventId,
      meta: Prisma.DbNull,
    }
  });

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    image: message.image,
    route: message.route,
    code: tenantId,
    id: pushNotification.id,
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        }
      },
      payload
    );
    // Log sending success by updating sentAt
    await prisma.pushNotification.update({
      where: { id: pushNotification.id },
      data: { sentAt: new Date() },
    });
  } catch (err: any) {
    const status = err?.statusCode;
    const isPermanent = status === 404 || status === 410;

    if (isPermanent) {
      logger.warn({ err, subscriptionId: meta.subscriptionId }, 'Removing expired push subscription');
      await prisma.pushSubscription.delete({ where: { id: meta.subscriptionId } });
      return;
    }

    logger.error({ err, subscriptionId: meta.subscriptionId }, 'Failed to send push notification');
    throw err;
  }
};
