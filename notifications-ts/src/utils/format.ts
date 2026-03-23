import { Currency } from '../clients/komunitin/types';

export const formatAmount = (amount: number, currency: Currency, locale: string = 'ca'): string => {
  const { scale, decimals, symbol } = currency.attributes;
  const value = amount / Math.pow(10, scale);
  
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD', // Dummy currency to determine symbol position
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return formatter.formatToParts(value)
    .map(part => {
      if (part.type === 'currency') {
        return symbol;
      }
      return part.value;
    })
    .join('');
};

export const formatDate = (isoDate: string, locale: string = 'en'): string => {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const getTimeAgoParams = (date: Date): { time: number; range: 'day' | 'month' | 'year' } => {
  const msPerDay = 1000 * 60 * 60 * 24;
  const elapsedDays = Math.floor((Date.now() - date.getTime()) / msPerDay);

  if (elapsedDays < 30) {
    return { time: -elapsedDays, range: 'day' };
  }
  if (elapsedDays < 365) {
    return { time: -Math.max(1, Math.floor(elapsedDays / 30)), range: 'month' };
  }
  return { time: -Math.max(1, Math.floor(elapsedDays / 365)), range: 'year' };
};

// Helper to truncate text
export const truncateText = (str: string, length: number): string => {
  return str.length > length ? str.substring(0, length-1) + '…' : str;
};