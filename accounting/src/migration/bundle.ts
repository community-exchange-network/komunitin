import { createHash, randomUUID } from 'node:crypto'
import { badRequest } from '../utils/error'
import { currencyKeyRoles, currencySecretColumns } from './format'
import { parseAccountsCsv, parseCurrencyCsv, parseEnvelope, parseTransfersCsv } from './schemas'

type Envelope = ReturnType<typeof parseEnvelope>
type CurrencyRow = ReturnType<typeof parseCurrencyCsv>
type AccountRow = ReturnType<typeof parseAccountsCsv>[number]
type TransferRow = ReturnType<typeof parseTransfersCsv>[number]
type Settings = Record<string, string | boolean | number | string[]>

const orderedDates = (row: { createdAt?: string, updatedAt?: string }) =>
  !row.createdAt || !row.updatedAt || row.createdAt <= row.updatedAt

const requireUnique = (values: (string | undefined)[], label: string) => {
  const supplied = values.filter(value => value !== undefined)
  if (new Set(supplied).size !== supplied.length) {
    throw badRequest(`Duplicate ${label}`)
  }
}

const settingsFromRow = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row)
  .filter(([key, value]) => key.startsWith('settings.') && value !== undefined)
  .map(([key, value]) => [key.slice('settings.'.length), value])) as Settings

const resolveUser = (users: ReadonlyMap<string, string>, email: string) => {
  const id = users.get(email)
  if (!id) {
    throw badRequest(`Unknown user ${email}`)
  }
  return id
}

const resolveCurrency = (row: CurrencyRow, users: ReadonlyMap<string, string>) => {
  const invalidDecimals = row.decimals !== undefined && row.scale !== undefined && row.decimals > row.scale
  if (!orderedDates(row) || invalidDecimals) {
    throw badRequest('Invalid currency timestamps or decimals')
  }
  return {
    ...row,
    adminId: row.adminUser ? resolveUser(users, row.adminUser) : undefined,
    settings: settingsFromRow(row),
  }
}

const resolveAccounts = (
  rows: AccountRow[],
  currencyCode: string,
  members: Envelope['members'],
  users: ReadonlyMap<string, string>,
) => {
  const membersByCode = new Map(members.map(member => [member.code, member]))
  const accounts = rows.map(row => {
    const member = membersByCode.get(row.code)
    if (!member || !row.code.startsWith(currencyCode) || !orderedDates(row)) {
      throw badRequest(`Invalid account ${row.code}`)
    }
    requireUnique(member.users, `owner for ${row.code}`)
    if (!member.users.length && member.status !== 'deleted') {
      throw badRequest(`Account ${row.code} requires an owner`)
    }
    return {
      ...row,
      status: member.status,
      users: member.users.map(email => resolveUser(users, email)),
      settings: settingsFromRow(row),
    }
  })
  requireUnique(accounts.map(account => account.id), 'account UUID')
  requireUnique(accounts.map(account => account.code), 'account code')
  if (accounts.length !== members.length) {
    throw badRequest('Account and member mappings must match')
  }
  return accounts
}

const validateWhitelists = (whitelists: (string[] | undefined)[], accountCodes: ReadonlySet<string>) => {
  for (const whitelist of whitelists) {
    if (whitelist?.some(code => !accountCodes.has(code))) {
      throw badRequest('Unknown whitelist account')
    }
  }
}

const resolveTransfers = (rows: TransferRow[], accountCodes: ReadonlySet<string>, users: ReadonlyMap<string, string>) => {
  const transfers = rows.map(row => {
    if (!row.amount || BigInt(row.amount) <= 0n || !orderedDates(row)) {
      throw badRequest('Invalid historical transfer')
    }
    if (!accountCodes.has(row.payer) || !accountCodes.has(row.payee) || row.payer === row.payee) {
      throw badRequest('Invalid historical transfer')
    }
    return { ...row, amount: row.amount, user: resolveUser(users, row.user) }
  })
  requireUnique(transfers.map(transfer => transfer.id), 'transfer UUID')
  return transfers
}

const computeBalances = (
  accounts: ReturnType<typeof resolveAccounts>,
  transfers: ReturnType<typeof resolveTransfers>,
) => {
  // History starts at zero. A supplied balance is an assertion, never an opening-balance adjustment.
  const balances = new Map(accounts.map(account => [account.code, 0n]))
  for (const transfer of transfers) {
    const amount = BigInt(transfer.amount)
    balances.set(transfer.payer, balances.get(transfer.payer)! - amount)
    balances.set(transfer.payee, balances.get(transfer.payee)! + amount)
  }
  for (const account of accounts) {
    const computed = balances.get(account.code)!
    if (account.balance !== undefined && computed !== BigInt(account.balance)) {
      throw badRequest(`Account ${account.code}: balance differs from complete history`)
    }
    if (account.status === 'deleted' && computed !== 0n) {
      throw badRequest(`Deleted account ${account.code} has a nonzero balance`)
    }
  }
  return Object.fromEntries([...balances].map(([code, balance]) => [code, balance.toString()]))
}

/** Validate accounting facts and resolve Social's canonical identities before any writes. */
export const parseAccountingBundle = (input: unknown) => {
  const { files, users, members } = parseEnvelope(input)
  requireUnique(users.map(user => user.email), 'user email')
  requireUnique(users.map(user => user.id), 'user UUID')
  requireUnique(members.map(member => member.code), 'member code')
  const userIds = new Map(users.map(user => [user.email, user.id]))

  const currency = resolveCurrency(parseCurrencyCsv(files['currency.csv']), userIds)
  const accounts = resolveAccounts(parseAccountsCsv(files['accounts.csv'], currency.scale), currency.code, members, userIds)
  requireUnique([
    ...currencyKeyRoles.map(role => currency[currencySecretColumns[role]]),
    ...accounts.map(account => account.stellarSecret),
  ], 'Stellar key')

  const accountCodes = new Set(accounts.map(account => account.code))
  validateWhitelists([
    currency['settings.defaultAcceptPaymentsWhitelist'],
    ...accounts.map(account => account['settings.acceptPaymentsWhitelist']),
  ], accountCodes)
  const transferRows = files['transfers.csv'] === undefined ? [] : parseTransfersCsv(files['transfers.csv'], currency.scale)
  const transfers = resolveTransfers(transferRows, accountCodes, userIds)
  if (accounts.length + transfers.length + users.length > 100_000) {
    throw badRequest('Migration exceeds row limit')
  }

  return { currency, accounts, transfers, users: users.map(user => user.id), balances: computeBalances(accounts, transfers) }
}

export type AccountingBundle = ReturnType<typeof parseAccountingBundle>

/** Fingerprint validated input before assigning IDs, timestamps or generated keys. */
export const bundleFingerprint = (bundle: AccountingBundle) =>
  createHash('sha256').update(JSON.stringify(bundle)).digest('hex')

/** Resolve missing IDs and dates once; the worker always uses this persisted snapshot on retries. */
export const resolveBundle = (bundle: AccountingBundle) => {
  const now = new Date().toISOString()
  const dates = (row: { createdAt?: string, updatedAt?: string }) => {
    const createdAt = row.createdAt ?? row.updatedAt ?? now
    return { createdAt, updatedAt: row.updatedAt ?? createdAt }
  }
  return {
    ...bundle,
    currency: { ...bundle.currency, id: bundle.currency.id ?? randomUUID(), ...dates(bundle.currency) },
    accounts: bundle.accounts.map(account => ({ ...account, id: account.id ?? randomUUID(), ...dates(account) })),
    transfers: bundle.transfers.map(transfer => ({ ...transfer, id: transfer.id ?? randomUUID() })),
  }
}

export type ResolvedBundle = ReturnType<typeof resolveBundle>
