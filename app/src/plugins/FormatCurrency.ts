import { Currency } from "src/store/model";
import { i18n } from "../boot/i18n";

export interface CurrencyFormat {
  /**
   * Whether to render all the decimals. Default to true.
   */
  decimals?: boolean;
  /**
   * Whether to apply the currency scale so the input value in an integer. Default to true.
   */
  scale?: boolean;
  /**
   * Whether to use the currency symbol. Default to true.
   */
  symbol?: boolean;
}

export interface CurrencyParse {
  /**
   * Whether to apply the currency scale so the output value in an integer. Default to true.
   */
  scale?: boolean;
}

/**
 * Format the given amount as a currency.
 *
 * @param amount The integer amount, unscaled.
 * @param currency The currency
 * @param options Format options.
 */
export default function formatCurrency(
  amount: number,
  currency: Currency,
  options?: CurrencyFormat
): string {
  
  const currencyOptions = {
    scale: currency.attributes.scale,
    decimals: currency.attributes.decimals,
    symbol: currency.attributes.symbol
  }
  return formatCurrencyAmount(amount, currencyOptions, options)
}

export function formatGlobalCurrency(
  amount: number,
  options?: CurrencyFormat
): string {

  const globalCurrencyOptions = {
    scale: 6,
    decimals: 2,
    symbol: 'h'
  }
  return formatCurrencyAmount(amount, globalCurrencyOptions, options)
}

function formatCurrencyAmount(amount: number, currencyOptions: {scale: number, decimals: number, symbol: string}, formatOptions?: CurrencyFormat) {
  const {n} = i18n.global
  // Decimals and scale are true if undefined.
  const doDecimals = formatOptions?.decimals ?? true;
  const doScale = formatOptions?.scale ?? true;
  const doSymbol = formatOptions?.symbol ?? true;
  
  if (doScale) {
    amount = amount / 10 ** currencyOptions.scale;
  }

  let amountString = doDecimals
  ? n(amount, {
    minimumFractionDigits: currencyOptions.decimals,
    maximumFractionDigits: currencyOptions.decimals,
  })
  : n(amount);

  if (doSymbol) {
    const sampleCurrency = n(1, {style: 'currency', currency: 'USD'})
    amountString = sampleCurrency.startsWith('1') 
      ? `${amountString}${currencyOptions.symbol}` 
      : `${currencyOptions.symbol}${amountString}` 
  }
  return amountString
}

/**
 * Formats price as a currency only if it is numeric.
 */
export function formatPrice(price: string, currency: Currency, options?: CurrencyFormat): string {
  const actualOptions = {
    decimals: true,
    scale: false,
    ...options
  }
  const numeric = Number(price)
  if (!isNaN(numeric)) {
    return formatCurrency(numeric, currency, actualOptions)
  } else {
    return price
  }
}

/**
 * Convert numeric amount from one currency to another. The result must then be formatted
 * with the target currency.
 */
export function convertCurrency(amount: number, from: Currency, to: Currency): number {
  return amount 
    * (from.attributes.rate.n / from.attributes.rate.d)
    * (to.attributes.rate.d / to.attributes.rate.n)
}

/**
 * Returns the numeric amount from input string. Returns false if the input is not a valid amount.
 * TODO: localization
 * @param amount 
 * @param currency 
 */
export function parseAmount(amount: string, currency: Currency, options?: CurrencyParse): number | false {
  // check if string represents a number
  let numeric = parseFloat(amount)
  if (isNaN(numeric) || isNaN(Number(amount))) {
    return false
  }
  if (options?.scale ?? true) {
    numeric = numeric * 10 ** currency.attributes.scale
  }
  return numeric  
}

/**
 * Best effort to convert a string into a valid account number in the form
 * ABCD0123 where ABCD is the currency code and 0123 is the account number.
 * Examples:
 * - "003" => "ABCD0003"
 * - "ABCD003" => "ABCD0003"
 * - "abcd0003" => "ABCD0003"
 * - "" => "ABCD0000"
 * - "hello" => "ABCDhello"
 */
export function normalizeAccountCode(search: string, currency: Currency) {
  search = search.trim()
  const currencyCode = currency.attributes.code
  // strip currency code (to be added later)
  if (search.toLowerCase().startsWith(currencyCode.toLowerCase())) {
    search = search.substring(currencyCode.length)
  }
  // pad number
  if (search.match(/^[0-9]+$/)) {
    search = search.padStart(4, '0')
  }
  // add currency code
  search = currencyCode + search
  return search
}