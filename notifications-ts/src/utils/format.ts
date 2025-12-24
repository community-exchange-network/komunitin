import { Currency } from '../api/types';

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
