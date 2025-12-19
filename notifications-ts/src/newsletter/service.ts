import { KomunitinClient } from '../api/client';
import { Mailer, saveNewsletter } from '../services/mailer';
import { generateNewsletterHtml } from './template';
import logger from '../utils/logger';
import { config } from '../config';
import { Offer, Need, NewsletterContext, ProcessedItem } from './types';
import prisma from '../utils/prisma';
import { shouldSendNewsletter } from './frequency';

import { selectBestItems, getDistance } from './posts-algorithm';
import { Member, HistoryLog } from './types';
import { getAccountSectionData } from './account-algorithm';

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
        name: author?.attributes.name || 'Unknown',
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

  // 3. Cache Content
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
    from: oneMonthAgo.toISOString()
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

    // 0. Check Recipients (Users)
    const users = await client.getMemberUsers(member.id);
    const recipientsToProcess: { user: any, settings: any }[] = [];

    // Fetch history for frequency check (last 50 logs should cover > 1 month even if daily)
    const history = await prisma.newsletterLog.findMany({
      where: { memberId: member.id },
      orderBy: { sentAt: 'desc' },
      take: 50
    }) as HistoryLog[];

    for (const user of users) {
      let userSettings;
      try {
        userSettings = await client.getUserSettings(user.id);
      } catch (e) {
        logger.warn({ user: user.id, err: e }, 'Failed to fetch user settings, skipping user');
        continue;
      }

      const frequency = userSettings.attributes.emails.group; // 'weekly', 'monthly', etc.
      if (!frequency || frequency === 'never') continue;

      // Check last sent
      const lastSentLog = history.find(log => 
        (log.recipients as any[]).some((r: any) => r.userId === user.id)
      );

      const lastSentDate = lastSentLog ? new Date(lastSentLog.sentAt) : undefined;
      const shouldSend = forceSend || shouldSendNewsletter(frequency, lastSentDate, new Date());

      if (shouldSend) {
        recipientsToProcess.push({ user, settings: userSettings });
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

    // Best offers for me (Using Algorithm)
    const bestOffers = selectBestItems({
      targetMember: member,
      items: allOffers,
      members: memberMap,
      history,
      globalFeaturedIndex
    }, { freshCount: 2, randomCount: 1 }) as Offer[];

    // Best needs for me (Using Algorithm)
    const bestNeeds = selectBestItems({
      targetMember: member,
      items: allNeeds,
      members: memberMap,
      history,
      globalFeaturedIndex
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
    let expiredNeeds: any[] = [];
    try {
      expiredOffers = await client.getOffers(group.attributes.code, {
        'filter[member]': member.id,
        'filter[expired]': 'true'
      });
      expiredNeeds = await client.getNeeds(group.attributes.code, {
        'filter[member]': member.id,
        'filter[expired]': 'true'
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to fetch expired offers/needs');
    }
    const accountSection = getAccountSectionData({
      member,
      account,
      activeOffers,
      activeNeeds,
      expiredOffers,
      expiredNeeds,
      transfers,
      history,
      currency
    });


    // Get Users
    // const users = await client.getMemberUsers(member.id); // Moved up
    const sentRecipients: { userId: string, email: string }[] = [];

    // Major content (bestOffers, etc.) is member-centric.
    // Users can have different locales or preferences.
    

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
      const context: NewsletterContext = {
        ...contextBase,
        recipient: {
          userId: user.id,
          email: user.attributes.email,
          language: userSettings.attributes.language
        }
      };
      const html = await generateNewsletterHtml(context);

      try {
        // Dev mode: save to file
        if (config.DEV_SAVE_NEWSLETTERS) {
          saveNewsletter(member.attributes.code, html);
        }
        // Send Email
        await mailer.sendNewsletter(user.attributes.email, `Novetats a ${group.attributes.name}`, html);
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
          groupId: group.attributes.code,
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
    // 1. Get all active groups
    let groups = await client.getGroups({ 'filter[status]': 'active' });

    if (options?.memberCode && !options?.groupCode) {
      options.groupCode = options.memberCode.substring(0, 4);
    }
    
    if (options?.groupCode) {
      groups = groups.filter((g: any) => g.attributes.code === options.groupCode);
    }

    logger.info({ count: groups.length }, 'Fetched active groups');

    for (const group of groups) {
      await processGroupNewsletter(group, client, mailer, options?.memberCode, options?.forceSend);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error running newsletter job');
  }
};
