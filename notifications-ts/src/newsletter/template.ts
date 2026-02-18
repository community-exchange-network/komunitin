import { formatAmount } from '../utils/format';
import initI18n from '../utils/i18n';
import { NewsletterContext } from './types';
import { renderTemplate } from '../utils/email-template';


// Helper to truncate text
const truncate = (str: string, length: number) => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

export const generateNewsletterHtml = async (ctx: NewsletterContext): Promise<string> => {
  const { recipient, account, bestOffers, bestNeeds, group, currency, accountSection, appUrl } = ctx;
  const i18n = await initI18n();

  
  const lng = recipient.language;
  const subject = i18n.t('newsletter.subject', { lng, group: group.attributes.name });
  const greetingName = ctx.member.attributes.name.trim();

  // Prepare view data
  const balance = account.attributes.balance;
  const formattedBalance = formatAmount(balance, currency, lng);

  const balanceText = accountSection?.balanceAdviceId
    ? i18n.t(accountSection.balanceAdviceId, { lng })
    : '';

  const activityText = (accountSection?.activityCount && accountSection.activityCount > 0)
    ? i18n.t('newsletter.activity_count', { lng, count: accountSection.activityCount })
    : null;

  // Helper to build full URLs
  const buildUrl = (path: string) => {
    // Replace :code placeholder with actual group code
    const resolvedPath = path.replace(':code', group.attributes.code);
    return `${appUrl}${resolvedPath}`;
  };

  let alertData: any = null;
  if (accountSection?.alert) {
    alertData = {
      title: i18n.t(accountSection.alert.titleId, { lng, ...accountSection.alert.messageParams }),
      text: i18n.t(accountSection.alert.textId, { lng, ...accountSection.alert.messageParams }),
      actionText: i18n.t(accountSection.alert.actionTextId, { lng }),
      actionUrl: buildUrl(accountSection.alert.actionUrl),
      type: accountSection.alert.type
    };
  }

  const formatDistance = (km: number | undefined): string | undefined => {
    if (km === undefined || km >= 100) return undefined;
    if (km < 1) return '1 km';
    if (km < 3) return `${Math.round(km)} km`;
    // Round to nearest 5
    return `${Math.round(km / 5) * 5} km`;
  };

  const viewData = {
    ...ctx,
    subject,
    greetingName,
    formattedBalance,
    balanceText,
    activityText,
    alert: alertData,
    groupInitial: group.attributes.name.charAt(0).toUpperCase(),
    bestOffers: bestOffers.map(item => ({
      ...item,
      description: truncate(item.description || '', 80),
      title: truncate(item.title || '', 40),
      authorName: item?.author?.name ?? "",
      formattedDistance: formatDistance(item.distance),
      link: item.link
    })),
    bestNeeds: bestNeeds.map(item => ({
      ...item,
      description: truncate(item.description || '', 80),
      title: truncate(item.title || '', 40),
      authorName: item?.author?.name ?? "",
      formattedDistance: formatDistance(item.distance),
      link: item.link
    })),
  };

  const html = await renderTemplate('newsletter', viewData);

  return html;
};
