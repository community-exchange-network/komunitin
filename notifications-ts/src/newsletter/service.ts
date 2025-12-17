import { KomunitinClient } from '../api/client';
import { Mailer } from '../services/mailer';
import { generateNewsletterHtml } from './template';
import logger from '../utils/logger';
import { Offer, Need, NewsletterContext } from './types';
import prisma from '../utils/prisma';

// Helper to filter old offers (> 3 months)
const isOld = (dateStr: string) => {
  const date = new Date(dateStr);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  return date < threeMonthsAgo;
};

import { selectBestItems } from './algorithm';
import { Member, HistoryLog } from './types';
import { getAccountSectionData } from './account-algorithm';

const processGroupNewsletter = async (group: any, client: KomunitinClient, mailer: Mailer) => {
  logger.info({ group: group.attributes.code }, 'Processing group');

  // 3. Cache Content
  // Fetch ALL offers/needs using the pagination-enabled client methods
  const allOffers = await client.getOffers(group.attributes.code, { sort: '-created' });
  const allNeeds = await client.getNeeds(group.attributes.code, { sort: '-created' });

  // Stats (Mocked or fetched if endpoint exists)
  const stats = { exchanges: 54, newMembers: 8 }; // Placeholder

  // 4. Iterate Members
  const membersList = await client.getGroupMembers(group.attributes.code, { 'filter[status]': 'active', include: 'account' });
  const memberMap = new Map<string, Member>(membersList.map((m: any) => [m.id, m]));
  const globalFeaturedIndex = new Map<string, number>();

  for (const member of membersList) {
    // Filter newsletter enabled (check member settings?)

    // Get Account (included in member fetch usually? or fetch separate)
    // If member.relationships.account exists...
    // Using separate fetch for safety / freshness
    let account;
    try {
      account = await client.getAccount(group.attributes.code, member.relationships.account.data.id);
    } catch (e) {
      logger.warn({ member: member.id, err: e }, 'Failed to fetch account, skipping member');
      continue;
    }

    // Compute Personal Content
    // My old offers
    const myOffers = allOffers.filter((o: Offer) => o.relationships.author.data.id === member.id && isOld(o.attributes.created));

    // Best offers for me (Using Algorithm)
    // 1. Fetch History
    const historyLogs = await prisma.newsletterLog.findMany({
      where: { memberId: member.id },
      orderBy: { sentAt: 'desc' },
      take: 3
    });

    const history: HistoryLog[] = historyLogs.map((log: any) => ({
      content: log.content
    }));

    const lastLog = historyLogs[0];
    const lastNewsletterDate = lastLog ? new Date(lastLog.sentAt) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to 1 month ago

    const bestOffers = selectBestItems({
      targetMember: member,
      items: allOffers,
      members: memberMap,
      history,
      lastNewsletterDate,
      globalFeaturedIndex
    }, { freshCount: 2, randomCount: 1 }) as Offer[];

    const bestNeeds = selectBestItems({
      targetMember: member,
      items: allNeeds,
      members: memberMap,
      history,
      lastNewsletterDate,
      globalFeaturedIndex
    }, { freshCount: 2, randomCount: 1 }) as Need[];



    // Account Section Data
    // --------------------
    let accountSection;
    if (account) {
      // Fetch Transfers (Last Month)
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      let transfers: any[] = [];
      try {
        // Fetch FROM
        const t1 = await client.getTransfers(group.attributes.code, {
          'filter[from]': account.id,
          'filter[created][gt]': oneMonthAgo.toISOString(),
          'filter[state]': 'cleared'
        });
        // Fetch TO
        const t2 = await client.getTransfers(group.attributes.code, {
          'filter[to]': account.id,
          'filter[created][gt]': oneMonthAgo.toISOString(),
          'filter[state]': 'cleared'
        });
        transfers = [...t1, ...t2];
      } catch (e) {
        logger.warn({ err: e }, 'Failed to fetch transfers');
      }

      // Active/Expired Offers/Needs
      const activeOffers = allOffers.filter((o: any) => o.relationships.author.data.id === member.id);
      const activeNeeds = allNeeds.filter((n: any) => n.relationships.author.data.id === member.id);

      // Fetch Only Expired explicitly? Or iterate "all" if we had them?
      // We do NOT have expired offers in 'allOffers' because global list is active only (usually).
      // So fetch expired count/list.
      let expiredOffers: any[] = [];
      let expiredNeeds: any[] = [];

      try {
        expiredOffers = await client.getOffers(group.attributes.code, {
          'filter[author]': member.id,
          'filter[expires][lt]': new Date().toISOString()
        });
        expiredNeeds = await client.getNeeds(group.attributes.code, {
          'filter[author]': member.id,
          'filter[expires][lt]': new Date().toISOString()
        });
      } catch (e) { /* ignore */ }

      accountSection = getAccountSectionData({
        member,
        account,
        activeOffers,
        activeNeeds,
        expiredOffers,
        expiredNeeds,
        transfers,
        history,
        currencySymbol: group.attributes.currencySymbol || '¤',
        currencyRate: 1 // TODO: fetch currency rate if available
      });
    }

    // Get Users
    const users = await client.getMemberUsers(member.id);
    const sentRecipients: { userId: string, email: string }[] = [];

    // Personal content is currently same for member, but could vary by user preferences.
    // Assuming major content (bestOffers, etc.) is member-centric.

    // Generate HTML (once per member/context implies same content)
    // Ideally we generate once if content is identical. 
    // But we need 'user' in context for potential personalization (name?).
    // Let's iterate users to send, then log.

    // Compute Personal Content (Member level)
    const contextBase: NewsletterContext = {
      group,
      member,
      user: null, // to be filled
      account,
      bestOffers,
      bestNeeds,
      oldOffers: myOffers,
      stats,
      accountSection
    };

    for (const user of users) {
      // Check user locale/prefs ...
      const context = { ...contextBase, user };

      const html = await generateNewsletterHtml(context);

      try {
        // Send Email
        await mailer.sendNewsletter(user.attributes.email, `Novetats a ${group.attributes.name}`, html);
        logger.info({ user: user.id }, 'Newsletter sent');
        sentRecipients.push({ userId: user.id, email: user.attributes.email });
      } catch (err) {
        logger.error({ err, user: user.id }, 'Failed to send newsletter');
      }
    }

    if (sentRecipients.length > 0) {
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
              accountSection: accountSection // Log computed section including alerts
            }
          }
        });
      } catch (err) {
        logger.error({ err, member: member.id }, 'Failed to save newsletter log');
      }
    }
  }
};

export const runNewsletter = async () => {
  logger.info('Starting newsletter generation...');
  const client = new KomunitinClient();
  const mailer = new Mailer();

  try {
    // 1. Get all active groups
    const groups = await client.getGroups({ 'filter[status]': 'active' });
    logger.info({ count: groups.length }, 'Fetched active groups');

    for (const group of groups) {
      await processGroupNewsletter(group, client, mailer);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error running newsletter job');
  }
};
