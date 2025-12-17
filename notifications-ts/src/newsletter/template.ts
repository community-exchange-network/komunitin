import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import initI18n from '../utils/i18n';
import { NewsletterContext, Offer, Need } from './types';
import logger from '../utils/logger';

// Helper to truncate text
const truncate = (str: string, length: number) => {
  return str.length > length ? str.substring(0, length) + '...' : str;
};

// Helper to format currency
const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('ca-ES', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) + currency;
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
  const { user, account, bestOffers, bestNeeds, group } = ctx;
  const i18n = await initI18n();

  // Set language based on user preference (defaults to 'ca' if not set/supported)
  // Assuming user.attributes.language contains 'ca', 'es', etc.
  const lng = user.attributes.language || 'ca';

  // Register 't' helper for this render
  Handlebars.registerHelper('t', (key, options) => {
    return i18n.t(key, { lng, ...options.hash });
  });

  const template = await loadTemplate();

  // Prepare view data
  const balance = account.attributes.balance / Math.pow(10, account.attributes.decimals || 2);
  const formattedBalance = formatCurrency(balance, account.attributes.currencySymbol || 'ħ');

  const balanceText = balance > 0
    ? i18n.t('newsletter.balance_positive', { lng })
    : i18n.t('newsletter.balance_negative', { lng });

  // Pre-process items for display (simple truncate)
  const processItems = (items: any[]) => items.map(item => ({
    ...item,
    title: truncate(item.attributes.name, 25),
    description: truncate(item.attributes.description || '', 40),
    authorName: '...' // TODO: fetch author name if available in included
  }));

  const viewData = {
    ...ctx,
    formattedBalance,
    balanceText,
    bestOffers: processItems(bestOffers),
    bestNeeds: processItems(bestNeeds),
    // oldOffers are just used for count in template, no need to process items unless showing details
  };

  return template(viewData);
};
