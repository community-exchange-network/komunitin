import logger from '../../../utils/logger';
import { eventBus } from '../../event-bus';
import { EVENT_NAME } from '../../events';
import { handleTransferCommitted, handleTransferPending, handleTransferRejected, handleTransferStillPending } from './transfer';

export const initInAppChannel = (): (() => void) => {
  logger.info('Initializing in-app notification channel');

  // Subscribe to transfer events and collect unsubscribe functions
  const unsubscribers = [
    eventBus.on(EVENT_NAME.TransferCommitted, handleTransferCommitted),
    eventBus.on(EVENT_NAME.TransferPending, handleTransferPending),
    eventBus.on(EVENT_NAME.TransferRejected, handleTransferRejected),
    eventBus.on(EVENT_NAME.TransferStillPending, handleTransferStillPending),
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

