import fs from 'fs/promises';
import Handlebars from 'handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatAmount } from '../utils/format';
import initI18n from '../utils/i18n';
import logger from '../utils/logger';
import { NewsletterContext } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to truncate text
const truncate = (str: string, length: number) => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

let templateCache: Handlebars.TemplateDelegate | null = null;

const loadTemplate = async () => {
  if (templateCache) return templateCache;
  try {
    const templatePath = path.join(__dirname, 'templates', 'newsletter.hbs');
    const source = await fs.readFile(templatePath, 'utf-8');
    templateCache = Handlebars.compile(source);
    return templateCache;
  } catch (err) {
    logger.error({ err }, 'Failed to load newsletter template');
    throw err;
  }
};

export const generateNewsletterHtml = async (ctx: NewsletterContext): Promise<string> => {
  const { recipient, account, bestOffers, bestNeeds, group, currency, accountSection, appUrl } = ctx;
  const i18n = await initI18n();

  
  const lng = recipient.language;
  const unknownMemberName = i18n.t('newsletter.unknown_member', { lng });

  // Register 't' helper for this render
  Handlebars.registerHelper('t', (key, options) => {
    return i18n.t(key, { lng, ...options.hash });
  });

  const template = await loadTemplate();

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
    formattedBalance,
    balanceText,
    activityText,
    alert: alertData,
    groupInitial: group.attributes.name?.charAt(0).toUpperCase() || '?',
    bestOffers: bestOffers.map(item => ({
      ...item,
      description: truncate(item.description || '', 80),
      title: truncate(item.title || '', 40),
      authorName: item.author?.name?.trim() ? item.author.name : unknownMemberName,
      formattedDistance: formatDistance(item.distance),
      link: item.link
    })),
    bestNeeds: bestNeeds.map(item => ({
      ...item,
      description: truncate(item.description || '', 80),
      title: truncate(item.title || '', 40),
      authorName: item.author?.name?.trim() ? item.author.name : unknownMemberName,
      formattedDistance: formatDistance(item.distance),
      link: item.link
    })),
  };

  return template(viewData);
};
