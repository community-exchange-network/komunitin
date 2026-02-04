import { type Queue } from 'bullmq';
import logger from '../../utils/logger';
import { getCachedActiveGroups, getCachedGroupMembersWithUsers } from '../../utils/cached-resources';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Group } from '../../clients/komunitin/types';
import { dispatchSyntheticEnrichedEvent, dispatchSyntheticEvent, lastNotificationDateByUser } from './shared';
import { EVENT_NAME } from '../events';
import { send } from 'process';

/**
 * Engagement synthetic events.
 * 
 * This module periodically checks for members with no offers (and negative balance) or
 * no needs (and positive balance) and triggers synthetic events to encourage engagement.
 * 
 * Only send this kind of event if:
 *  - This specific message has not been sent in the last 3 months.
 *  - There has been notification silence for the member in last 7 days.
 */

const JOB_NAME_ENGAGEMENT_EVENTS_CRON = 'engagement-events-cron-job';

const scheduleEngagementEventsCron = async (queue: Queue): Promise<void> => {
  // Set the cron job to run once a day
  await queue.upsertJobScheduler(
    'engagement-events-cron',
    { pattern: '12 12 * * *' }, // Every day at 12:12 PM
    { name: JOB_NAME_ENGAGEMENT_EVENTS_CRON }
  );
}

const stopEngagementEventsCron = async (queue: Queue): Promise<void> => {
  await queue.removeJobScheduler('engagement-events-cron');
}

const canSendEngagementEvent = (userId: string, lastEngagement: Date | undefined, lastNotification: Date | undefined): boolean => {
  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  if (lastEngagement && lastEngagement > threeMonthsAgo) {
    // Already sent engagement notification in last 3 months
    return false;
  }

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  if (lastNotification && lastNotification > sevenDaysAgo) {
    // Recent notification sent in last 7 days
    return false;
  }

  return true;
}


const processEngagementEventsForGroup = async (client: KomunitinClient, group: Group): Promise<void> => {
  const membersWithUsers = await getCachedGroupMembersWithUsers(client, group.attributes.code);
  const lastEngagementNotificationMap = await lastNotificationDateByUser(group.attributes.code, EVENT_NAME.MemberHasNoPosts);
  const lastNotificationMap = await lastNotificationDateByUser(group.attributes.code);

  for (const mwu of membersWithUsers) {
    // For each member, check if we need to send the engagement event. Check first the conditions that do
    // not require fetching additional data from the API.

    const { member, users } = mwu;

    const needsCounter = member.relationships.needs.meta.count ?? 0
    const offersCounter = member.relationships.offers.meta.count ?? 0

    if (needsCounter !== 0 && offersCounter !== 0) {
      // Member has both needs and offers, quick skip
      continue;
    }

    const candidates: Array<{ user: any; settings: any }> = [];
    for (const { user, settings } of users) {
      if (canSendEngagementEvent(user.id, lastEngagementNotificationMap.get(user.id), lastNotificationMap.get(user.id))) {
        candidates.push({ user, settings });
      }
    }

    if (candidates.length === 0) {
      // No candidates to send engagement event
      continue;
    }

    // Fetch account to check balance
    const account = await client.getAccount(group.attributes.code, member.relationships.account.data.id);
    const balance = account.attributes.balance || 0;

    if (balance > 0 && needsCounter > 0 || balance <= 0 && offersCounter > 0) {
      // No need to send engagement event
      continue;
    }

    // Fetch updated member with offers/needs counts
    const updatedMember = await client.getMember(group.attributes.code, member.id);
    const updatedNeedsCounter = updatedMember.relationships.needs.meta.count ?? 0
    const updatedOffersCounter = updatedMember.relationships.offers.meta.count ?? 0

    const sendNoOffers = balance <= 0 && updatedOffersCounter === 0;
    const sendNoNeeds = balance > 0 && updatedNeedsCounter === 0;

    if (sendNoOffers || sendNoNeeds) {
      // Send engagement event
      const currency = await client.getCurrency(group.attributes.code);
      await dispatchSyntheticEnrichedEvent({
        name: EVENT_NAME.MemberHasNoPosts,
        code: group.attributes.code,
        data: {
          balance,
          type: sendNoOffers ? 'offers' : 'needs'
        },
        member: updatedMember,
        group,
        currency, 
        users: candidates,
      })
    }
  }

}

const handleEngagementEventsCron = async (): Promise<void> => {
  const client = new KomunitinClient();
  
  try {
    const groups = await getCachedActiveGroups(client);
    for (const group of groups) {
      await processEngagementEventsForGroup(client, group);
    }
  } catch (err) {
    logger.error({ err }, 'Error in engagement events cron');
    throw err;
  }
}

export const initEngagementEvents = (queue: Queue) => {
  scheduleEngagementEventsCron(queue).catch(err => {
    console.error({ err }, 'Failed to schedule engagement events cron');
  });

  return {
    handlers: {
      [JOB_NAME_ENGAGEMENT_EVENTS_CRON]: handleEngagementEventsCron,
    },
    stop: async () => stopEngagementEventsCron(queue)
  };
}

