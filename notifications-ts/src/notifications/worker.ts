import { setTimeout as delay } from 'timers/promises';
import logger from '../utils/logger';
import { createEventsStream } from './event-stream';
import { EVENT_NAME, EventName, GroupEvent, MemberEvent, NotificationEvent, PostEvent, TransferEvent, UserEvent } from './events';
import { handleGroupEvent } from './handlers/group';
import { handleMemberEvent } from './handlers/member';
import { handlePostEvent } from './handlers/post';
import { handleTransferEvent } from './handlers/transfer';
import { handleUserEvent } from './handlers/user';
import { initInAppChannel } from './channels/app';
import { initPushChannel } from './channels/push';
import { initEmailChannel } from './channels/email';
import { initSyntheticEvents } from './synthetic';

type WorkerHandle = {
  stop: () => Promise<void>;
};

/** 
 * Run the notifications worker that listens to the event stream,
 * then it calls to the appropriate handlers based on event type
 * (transfer, post, member, group). The handlers will in turn use
 * the event bus to notify the different channels (in-app, push, email).
 */
export const runNotificationsWorker = async (): Promise<WorkerHandle> => {
  // Initialize notification channels and collect stop functions
  const stopAppChannel = initInAppChannel();
  const stopPushChannel = initPushChannel();
  const stopEmailChannel = initEmailChannel();
  const stopSyntheticEvents = initSyntheticEvents();

  const stream = await createEventsStream();
  let stopped = false;

  const loop = (async () => {
    while (!stopped) {
      try {
        const event = await stream.getNext();
        await dispatchEvent(event).catch((err) => {
          logger.error({ err, event }, 'Error handling notification event');
        });
        await stream.ack(event.id);
      } catch (err) {
        if (stopped) {
          break;
        }
        logger.error({ err }, 'Error reading notifications stream, retrying');
        await delay(1000);
      }
    }
  })();

  loop.catch((err) => logger.error({ err }, 'Notifications worker crashed'));

  return {
    stop: async () => {
      stopped = true;
      // Close channels (remove listeners)
      stopAppChannel();
      stopPushChannel();
      stopEmailChannel();
      stopSyntheticEvents();
      // Close stream
      await stream.close();
      // Wait for loop to end, swallowing errors.
      await loop.catch(() => undefined);
    },
  };
};

export const dispatchEvent = async (event: NotificationEvent): Promise<void> => {
  switch (event.name as EventName) {
    case EVENT_NAME.TransferCommitted:
    case EVENT_NAME.TransferPending:
    case EVENT_NAME.TransferRejected:
    case EVENT_NAME.TransferStillPending:
      return handleTransferEvent(event as TransferEvent);
    
    case EVENT_NAME.NeedPublished:
    case EVENT_NAME.NeedExpired:
    case EVENT_NAME.OfferPublished:
    case EVENT_NAME.OfferExpired:
    case EVENT_NAME.PostExpiresSoon:
      return handlePostEvent(event as PostEvent);

    case EVENT_NAME.MemberJoined:
    case EVENT_NAME.MemberRequested:
    case EVENT_NAME.MemberHasExpiredPosts:
      return handleMemberEvent(event as MemberEvent);

    case EVENT_NAME.GroupRequested:
    case EVENT_NAME.GroupActivated:
      return handleGroupEvent(event as GroupEvent);

    case EVENT_NAME.UserRequestedEmailValidation:
    case EVENT_NAME.UserRequestedPasswordReset:
      return handleUserEvent(event as UserEvent);

    default:
      logger.info({ eventName: event.name }, 'No notification handler for event type');
  }
};

export default runNotificationsWorker;
