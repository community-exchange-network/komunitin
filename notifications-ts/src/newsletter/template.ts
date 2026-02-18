import { formatAmount } from '../utils/format';
import initI18n from '../utils/i18n';
import type {
  NewsletterContext,
  NewsletterTemplateAlert,
  NewsletterTemplateContext,
  NewsletterTemplateItem,
  ProcessedItem,
} from './types';
import { renderTemplate } from '../utils/email-template';


// Helper to truncate text
const truncateText = (str: string, length: number): string => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

const formatDistanceLabel = (km: number | undefined): string | undefined => {
  if (km === undefined || km >= 100) return undefined;
  if (km < 1) return '1 km';
  if (km < 3) return `${Math.round(km)} km`;
  return `${Math.round(km / 5) * 5} km`;
};

const mapItemToTemplateItem = (item: ProcessedItem): NewsletterTemplateItem => ({
  ...item,
  title: truncateText(item.title || '', 40),
  description: truncateText(item.description || '', 80),
  authorDisplayName: item.author?.name ?? '',
  distanceLabel: formatDistanceLabel(item.distance),
});

export const generateNewsletterHtml = async (ctx: NewsletterContext): Promise<string> => {
  const { recipient, member, account, bestOffers, bestNeeds, group, currency, stats, accountSection, appUrl } = ctx;
  const i18n = await initI18n();

  
  const lng = recipient.language;
  const subject = i18n.t('newsletter.subject', { lng, group: group.attributes.name });
  const greetingName = member.attributes.name.trim();

  // Prepare view data
  const balance = account.attributes.balance;
  const formattedBalance = formatAmount(balance, currency, lng);

  const balanceAdvice = accountSection?.balanceAdviceId
    ? i18n.t(accountSection.balanceAdviceId, { lng })
    : '';

  const activitySummary = (accountSection?.activityCount && accountSection.activityCount > 0)
    ? i18n.t('newsletter.activity_count', { lng, count: accountSection.activityCount })
    : null;

  // Helper to build full URLs
  const buildUrl = (path: string) => {
    // Replace :code placeholder with actual group code
    const resolvedPath = path.replace(':code', group.attributes.code);
    return `${appUrl}${resolvedPath}`;
  };

  let accountAlert: NewsletterTemplateAlert | null = null;
  if (accountSection?.alert) {
    accountAlert = {
      title: i18n.t(accountSection.alert.titleId, { lng, ...accountSection.alert.messageParams }),
      text: i18n.t(accountSection.alert.textId, { lng, ...accountSection.alert.messageParams }),
      actionText: i18n.t(accountSection.alert.actionTextId, { lng }),
      actionUrl: buildUrl(accountSection.alert.actionUrl),
      type: accountSection.alert.type
    };
  }

  const templateContext: NewsletterTemplateContext = {
    language: lng,
    unsubscribeUrl: recipient.unsubscribeToken
      ? `${appUrl}/unsubscribe?token=${recipient.unsubscribeToken}`
      : undefined,
    appUrl,
    group,
    member,
    subject,
    greetingName,
    formattedBalance,
    balanceAdvice,
    activitySummary,
    accountAlert,
    groupNameInitial: group.attributes.name.charAt(0).toUpperCase(),
    bestOffers: bestOffers.map(mapItemToTemplateItem),
    bestNeeds: bestNeeds.map(mapItemToTemplateItem),
    stats,
  };

  const html = await renderTemplate('newsletter', templateContext);

  return html;
};
