export const accountingPublicBaseUrl = 'https://accounting.test'

export const accountingCurrencyHref = (currencyCode: string) => {
  return `${accountingPublicBaseUrl}/${currencyCode}/currency`
}

export const accountingAccountHref = (currencyCode: string, accountId: string) => {
  return `${accountingPublicBaseUrl}/${currencyCode}/accounts/${accountId}`
}
