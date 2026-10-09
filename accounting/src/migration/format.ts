import type { LedgerCurrencyKeys } from '../ledger'

export const currencySecretColumns = {
  issuer: 'stellarIssuerSecret',
  credit: 'stellarCreditSecret',
  admin: 'stellarAdminSecret',
  externalIssuer: 'stellarExternalIssuerSecret',
  externalTrader: 'stellarExternalTraderSecret',
  disabledAccountsPool: 'stellarDisabledAccountsPoolSecret',
} as const satisfies Record<keyof LedgerCurrencyKeys, string>

export const currencyKeyRoles = Object.keys(currencySecretColumns) as (keyof LedgerCurrencyKeys)[]

/** Accounting's CSV columns, also used by bundle exporters. */
export const CSV_HEADERS = {
  'currency.csv': [
    'id', 'code', 'adminUser', 'name', 'namePlural', 'symbol', 'decimals', 'scale', 'rateNumerator',
    'rateDenominator', 'createdAt', 'updatedAt', 'settings.defaultInitialCreditLimit',
    'settings.externalTraderCreditLimit', 'settings.defaultInitialMaximumBalance',
    'settings.defaultOnPaymentCreditLimit', 'settings.externalTraderMaximumBalance',
    'settings.defaultAcceptPaymentsAfter', 'settings.defaultAcceptPaymentsWhitelist',
    'settings.defaultAllowPayments', 'settings.defaultAllowPaymentRequests',
    'settings.defaultAcceptPaymentsAutomatically', 'settings.defaultAllowSimplePayments',
    'settings.defaultAllowSimplePaymentRequests', 'settings.defaultAllowQrPayments',
    'settings.defaultAllowQrPaymentRequests', 'settings.defaultAllowMultiplePayments',
    'settings.defaultAllowMultiplePaymentRequests', 'settings.defaultAllowTagPayments',
    'settings.defaultAllowTagPaymentRequests', 'settings.defaultAllowExternalPayments',
    'settings.defaultAllowExternalPaymentRequests',
    'settings.defaultAcceptExternalPaymentsAutomatically', 'settings.enableExternalPayments',
    'settings.enableExternalPaymentRequests', 'settings.enableCreditCommonsPayments',
    'settings.defaultHideBalance', 'stellarIssuerSecret', 'stellarCreditSecret', 'stellarAdminSecret',
    'stellarExternalIssuerSecret', 'stellarExternalTraderSecret', 'stellarDisabledAccountsPoolSecret',
  ],
  'accounts.csv': [
    'id', 'code', 'balance', 'creditLimit', 'createdAt', 'updatedAt', 'maximumBalance',
    'settings.onPaymentCreditLimit', 'settings.acceptPaymentsAfter',
    'settings.acceptPaymentsWhitelist', 'settings.allowPayments', 'settings.allowPaymentRequests',
    'settings.allowSimplePayments', 'settings.allowSimplePaymentRequests',
    'settings.allowQrPayments', 'settings.allowQrPaymentRequests', 'settings.allowMultiplePayments',
    'settings.allowMultiplePaymentRequests', 'settings.allowTagPayments',
    'settings.allowTagPaymentRequests', 'settings.acceptPaymentsAutomatically',
    'settings.allowExternalPayments', 'settings.allowExternalPaymentRequests',
    'settings.acceptExternalPaymentsAutomatically', 'settings.hideBalance', 'stellarSecret',
  ],
  'transfers.csv': [
    'id', 'payer', 'payee', 'user', 'amount', 'description', 'createdAt', 'updatedAt',
  ],
} as const

export type AccountingCsvFilename = keyof typeof CSV_HEADERS
