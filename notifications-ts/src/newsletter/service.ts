import { KomunitinClient } from '../clients/komunitin/client';
import { Mailer } from '../clients/email/mailer';
import { generateNewsletterHtml } from './template';
import logger from '../utils/logger';
import { config } from '../config';
import { HistoryLog, NewsletterContext, ProcessedItem } from './types';
import prisma from '../utils/prisma';
import { shouldSendNewsletter, shouldProcessGroup } from './frequency';
import initI18n from '../utils/i18n';
import { getAuthCode } from '../clients/komunitin/getAuthCode';

import { selectBestItems, getDistance } from './posts-algorithm';
import { Member, Offer, Need, Group } from '../clients/komunitin/types';
import { getAccountSectionData } from './account-algorithm';
import { SeededRandom, stringToSeed } from '../utils/seededRandom';
import { CACHE_TTL_24H, CACHE_TTL_NO_CACHE, getCachedActiveGroups } from '../utils/cached-resources';


const processItems = (
  items: (Offer | Need)[],
  targetMember: Member,
  memberMap: Map<string, Member>,
  groupCode: string,
  type: 'offers' | 'needs'
): ProcessedItem[] => {
  return items.map(item => {
    const authorId = item.relationships.member.data.id;
    const author = memberMap.get(authorId);

    let distance: number | undefined;
    if (author) {
      const d = getDistance(targetMember, author);
      if (d !== Infinity) {
        distance = Math.round(d / 1000); // km
      }
    }

    const link = `${config.KOMUNITIN_APP_URL}/groups/${groupCode}/${type}/${item.attributes.code}`;

    return {
      id: item.id,
      code: item.attributes.code,
      type: type,
      title: "name" in item.attributes ? item.attributes.name : undefined,
      description: item.attributes.content,
      image: item.attributes.images?.[0],
      author: {
        name: author?.attributes.name || '',
        image: author?.attributes.image
      },
      distance,
      category: (item.attributes as any).category,
      link
    };
  });
};

const processGroupNewsletter = async (group: any, client: KomunitinClient, mailer: Mailer, memberCodeFilter?: string, forceSend?: boolean) => {
  logger.info({ group: group.attributes.code }, 'Processing group');

  // Check if group email newsletter is enabled
  let groupSettings;
  try {
    groupSettings = await client.getGroupSettings(group.attributes.code);
  } catch (err) {
    logger.warn({ err, group: group.attributes.code }, 'Failed to fetch group settings, skipping group');
    return;
  }

  if (!groupSettings.attributes.enableGroupEmail) {
    logger.info({ group: group.attributes.code }, 'Group email newsletter is disabled, skipping group');
    return;
  }

  const i18n = await initI18n();

  // 3. Fetch data to be used for all members of the group
  // Fetch ALL offers/needs using the pagination-enabled client methods
  const allOffers = await client.getOffers(group.attributes.code, { sort: '-updated' });
  const allNeeds = await client.getNeeds(group.attributes.code, { sort: '-updated' });
  const allMembers = await client.getMembers(group.attributes.code, { sort: '-created' });

  const currency = await client.getCurrency(group.attributes.code);

  // Total number of exchanges last month.
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const transferStats = await client.getTransferStats(group.attributes.code, {
    from: oneMonthAgo.toISOString()
  });
  const groupExchangesLastMonth = transferStats.attributes.values[0];

  // Number of active accounts last month
  const accountStats = await client.getAccountStats(group.attributes.code, {
    from: oneMonthAgo.toISOString(),
    minTransactions: 1
  });
  const activeAccountsLastMonth = accountStats.attributes.values[0];

  // Number of members created last month
  const groupMembersLastMonth = allMembers.filter((m: any) => m.attributes.created > oneMonthAgo.toISOString()).length;

  const stats = {
    exchanges: groupExchangesLastMonth,
    activeAccounts: activeAccountsLastMonth,
    newMembers: groupMembersLastMonth
  };

  // 4. Iterate Members
  const memberMap = new Map<string, Member>(allMembers.map((m: any) => [m.id, m]));
  const globalFeaturedIndex = new Map<string, number>();

  for (const member of allMembers) {
    if (memberCodeFilter && member.attributes.code !== memberCodeFilter) {
      continue;
    }

    // Check Recipients (Users)
    const usersAndSettings = await client.getMemberUsers(member.id);
    const recipientsToProcess: { user: any, settings: any }[] = [];

    // Fetch history for frequency check (last 50 logs should cover > 1 month even if daily)
    const history = await prisma.newsletterLog.findMany({
      where: { memberId: member.id },
      orderBy: { sentAt: 'desc' },
      take: 50
    }) as HistoryLog[];

    for (const { user, settings } of usersAndSettings) {
      const frequency = settings.attributes.emails.group; // 'weekly', 'monthly', etc.
      if (!frequency || frequency === 'never') continue;

      // Check last sent
      const lastSentLog = history.find(log =>
        (log.recipients as any[]).some((r: any) => r.userId === user.id)
      );

      const lastSentDate = lastSentLog ? new Date(lastSentLog.sentAt) : undefined;
      const shouldSend = forceSend || shouldSendNewsletter(frequency, lastSentDate, new Date());

      if (shouldSend) {
        recipientsToProcess.push({ user, settings });
      }
    }

    if (recipientsToProcess.length === 0) {
      continue;
    }

    // Get Account
    let account;
    try {
      account = await client.getAccount(group.attributes.code, member.relationships.account.data.id);
    } catch (e) {
      logger.warn({ member: member.id, err: e }, 'Failed to fetch account, skipping member');
      continue;
    }

    // 2. Posts section

    // Compute reproducible seed for this member's newsletter
    // Use last history log ID if available, otherwise use member ID
    const seedString = history.length > 0
      ? `${history[0].memberId}-${history[0].sentAt}`
      : member.id;
    const seed = stringToSeed(seedString);
    const rng = new SeededRandom(seed);

    // Best offers for me (Using Algorithm)
    const bestOffers = selectBestItems({
      targetMember: member,
      items: allOffers,
      members: memberMap,
      history,
      globalFeaturedIndex,
      rng
    }, { freshCount: 2, randomCount: 1 }) as Offer[];

    // Best needs for me (Using Algorithm)
    const bestNeeds = selectBestItems({
      targetMember: member,
      items: allNeeds,
      members: memberMap,
      history,
      globalFeaturedIndex,
      rng
    }, { freshCount: 2, randomCount: 1 }) as Need[];

    const selectedOffers = processItems(bestOffers, member, memberMap, group.attributes.code, 'offers');
    const selectedNeeds = processItems(bestNeeds, member, memberMap, group.attributes.code, 'needs');

    // Account Section Data
    // --------------------
    // Fetch Transfers (Last Month)
    let transfers: any[] = [];
    try {
      transfers = await client.getTransfers(group.attributes.code, {
        'filter[account]': account.id,
        'filter[from]': oneMonthAgo.toISOString(),
        'filter[state]': 'committed'
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to fetch transfers');
    }
    // Active/Expired Offers/Needs
    const activeOffers = allOffers.filter((o: any) => o.relationships.member.data.id === member.id);
    const activeNeeds = allNeeds.filter((n: any) => n.relationships.member.data.id === member.id);

    let expiredOffers: any[] = [];
    try {
      expiredOffers = await client.getOffers(group.attributes.code, {
        'filter[member]': member.id,
        'filter[expired]': 'true'
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to fetch expired offers');
    }
    const accountSection = getAccountSectionData({
      member,
      account,
      activeOffers,
      activeNeeds,
      expiredOffers,
      transfers,
      history,
      currency
    });


    const sentRecipients: { userId: string, email: string }[] = [];

    // Compute Personal Content (Member level)
    const contextBase: Omit<NewsletterContext, 'recipient'> = {
      group,
      member,
      account,
      currency,
      bestOffers: selectedOffers,
      bestNeeds: selectedNeeds,
      stats,
      accountSection,
      appUrl: config.KOMUNITIN_APP_URL
    };

    for (const { user, settings: userSettings } of recipientsToProcess) {
      let unsubscribeToken: string | undefined;
      try {
        unsubscribeToken = await getAuthCode(user.id);
      } catch (err) {
        logger.error({ err, user: user.id }, 'Failed to get unsubscribe token. Aborting sending to this user.');
        //abort
        continue;
      }

      const context: NewsletterContext = {
        ...contextBase,
        recipient: {
          userId: user.id,
          email: user.attributes.email,
          language: userSettings.attributes.language,
          unsubscribeToken
        }
      };
      const html = await generateNewsletterHtml(context);

      try {
        // Send Email
        const lng = userSettings.attributes.language || 'en';
        const subject = i18n.t('newsletter.subject', { lng, group: group.attributes.name });
        const unsubscribeUrl = `${config.KOMUNITIN_SOCIAL_PUBLIC_URL}/users/me/unsubscribe?token=${unsubscribeToken}`;
        await mailer.sendEmail({
          to: user.attributes.email,
          subject,
          html,
          unsubscribeUrl
        })
        logger.info({ user: user.id }, 'Newsletter sent');
        sentRecipients.push({ userId: user.id, email: user.attributes.email });
      } catch (err) {
        logger.error({ err, user: user.id }, 'Failed to send newsletter');
      }
    }

    // Log to DB (One entry per member)
    try {

      await prisma.newsletterLog.create({
        data: {
          memberId: member.id,
          tenantId: group.attributes.code,
          recipients: sentRecipients,
          content: {
            bestOffers: bestOffers.map(o => o.id),
            bestNeeds: bestNeeds.map(n => n.id),
            stats,
            account: {
              balance: accountSection.balance,
              activityCount: accountSection.activityCount,
              alert: accountSection.alert?.type,
            }
          } as any
        }
      });
    } catch (err) {
      logger.error({ err, member: member.id }, 'Failed to save newsletter log');
    }
  }
};

export const runNewsletter = async (options?: { groupCode?: string, memberCode?: string, forceSend?: boolean }) => {
  logger.info('Starting newsletter generation...');
  const client = new KomunitinClient();
  const mailer = new Mailer();

  try {
    const isManualRun = !!(options?.groupCode || options?.memberCode || options?.forceSend);

    const allGroups = await getCachedActiveGroups(client, isManualRun ? CACHE_TTL_NO_CACHE : CACHE_TTL_24H);

    let groupsToProcess: Group[] = allGroups;

    if (options?.memberCode && !options?.groupCode) {
      options.groupCode = options.memberCode.substring(0, 4);
    }

    if (options?.groupCode) {
      groupsToProcess = groupsToProcess.filter((g: any) => g.attributes.code === options.groupCode);
    }

    const groupsFiltered = groupsToProcess.filter(group => shouldProcessGroup(group, isManualRun));
    logger.info({ count: groupsFiltered.length }, 'Processing groups for newsletter');
    for (const group of groupsFiltered) {
      await processGroupNewsletter(group, client, mailer, options?.memberCode, options?.forceSend);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error running newsletter job');
  }
};
