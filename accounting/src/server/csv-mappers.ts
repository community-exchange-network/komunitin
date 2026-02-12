import { Account, Currency, Transfer } from "../model"

type CSVRow = Record<string, string | number | boolean | null>

export type CSVMapper<T> = (data: T) => CSVRow
export type CSVMapperFactory<T> = (currency: Currency) => CSVMapper<T>

/**
 * Format the amount for CSV export.
 * Specifically, it converts the amount to actual value (dividing by `10^currency.scale`) and
 * formats it as a string with at least `currency.decimals` decimal places, or more if needed
 * to avoid losing precision (up to currency.scale decimal places).
 */
const formatAmount = (amount: number | undefined, currency: Currency) => {
  if (amount === undefined) return ""
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.scale,
  }).format(amount / 10 ** currency.scale)
}

const mapAccountToCSV = (account: Account) => {
  return {
    'id': account.id,
    'created': account.created.toISOString(),
    'updated': account.updated.toISOString(),
    'code': account.code,
    'status': account.status,
    'balance': formatAmount(account.balance, account.currency),
    'creditLimit': formatAmount(account.creditLimit, account.currency),
    'maximumBalance': account.maximumBalance === false ? "" : formatAmount(account.maximumBalance, account.currency),
    'key': account.key,
    'user.id': account.users && account.users.length > 0 ? account.users[0].id : '',
  }
}

/**
 * CSV mapper for account resources.
 */
export const createAccountCSVMapper = (): CSVMapper<Account> => {
  return mapAccountToCSV
}

const mapTransferToCSV = (currency: Currency, transfer: Transfer) => {
  const payer = transfer.externalPayer ? transfer.externalPayer.resource : transfer.payer
  const payee = transfer.externalPayee ? transfer.externalPayee.resource : transfer.payee
  return {
    'id': transfer.id,
    'created': transfer.created.toISOString(),
    'updated': transfer.updated.toISOString(),
    'state': transfer.state,
    'amount': formatAmount(transfer.amount, currency),
    'description': transfer.meta.description || '',
    'hash': transfer.hash || '',
    'authorization': transfer.authorization?.type || '',
    'payer.id': payer.id,
    'payer.code': payer.code,
    'payee.id': payee.id,
    'payee.code': payee.code,
    'user.id': transfer.user.id
  }
}

/**
 * CSV mapper for transfer resources.
 */
export const createTransferCSVMapper = (currency: Currency): CSVMapper<Transfer> => {
  return (transfer) => mapTransferToCSV(currency, transfer)
}