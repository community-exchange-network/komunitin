import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import initI18n from '../utils/i18n';
import { NewsletterContext, Offer, Need } from './types';
import logger from '../utils/logger';
import { formatAmount } from '../utils/format';

// Helper to truncate text
const truncate = (str: string, length: number) => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

let templateCache: Handlebars.TemplateDelegate | null = null;

const loadTemplate = async () => {
  if (templateCache) return templateCache;
  try {
    const templatePath = path.join(__dirname, '../templates/newsletter.hbs');
    const source = await fs.readFile(templatePath, 'utf-8');
    templateCache = Handlebars.compile(source);
    return templateCache;
  } catch (err) {
    logger.error({ err }, 'Failed to load newsletter template');
    throw err;
  }
};

export const generateNewsletterHtml = async (ctx: NewsletterContext): Promise<string> => {
  const { recipient, account, bestOffers, bestNeeds, group, currency, accountSection } = ctx;
  const i18n = await initI18n();

  
  const lng = recipient.language;

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

  let alertData = null;
  if (accountSection?.alert) {
    alertData = {
      title: i18n.t(accountSection.alert.titleId, { lng, ...accountSection.alert.messageParams }),
      text: i18n.t(accountSection.alert.textId, { lng, ...accountSection.alert.messageParams }),
      actionText: i18n.t(accountSection.alert.actionTextId, { lng }),
      actionUrl: accountSection.alert.actionUrl,
      type: accountSection.alert.type
    };
  }

  const viewData = {
    ...ctx,
    formattedBalance,
    balanceText,
    alert: alertData,
    bestOffers: ctx.bestOffers.map(item => ({
      ...item,
      description: truncate(item.description || '', 80),
      title: truncate(item.title || '', 40)
    })),
    bestNeeds: ctx.bestNeeds.map(item => ({
      ...item,
      description: truncate(item.description || '', 80),
      title: truncate(item.title || '', 40)
    })),
  };

  return template(viewData);
};
