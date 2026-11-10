import type { BaseService } from '../controller'
import { defaultCurrencySettings } from '../controller/currency-controller'
import type { CreateCurrency, CurrencySettings } from '../model'
import { badRequest } from '../utils/error'
import type { Transfer as TransferRecord } from '@prisma/client'
import { ledgerNumber, validateLedgerAmount } from './amounts'
import { resolveBundle, type AccountingBundle, type ResolvedBundle } from './bundle'
import { hasStellarKeys } from './keys'

/** Resolve whitelist codes and convert monetary settings at the controller boundary. */
export const resolveSettings = (settings: AccountingBundle['currency']['settings'], accountIds: ReadonlyMap<string, string>) => {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => {
    // CSV schemas use arrays only for whitelist codes and strings only for scaled monetary settings.
    let resolved = value
    if (Array.isArray(value)) {
      resolved = value.map(code => accountIds.get(code)!)
    } else if (typeof value === 'string') {
      resolved = ledgerNumber(value)
    }
    return [key, resolved]
  }))
}

/** Build the controller input once all fields required for a new currency are present. */
export const currencyInput = (bundle: ResolvedBundle): CreateCurrency => {
  const source = bundle.currency
  const { name, namePlural, symbol, decimals, scale, rateNumerator, rateDenominator, adminId } = source
  if (name === undefined || namePlural === undefined || symbol === undefined || decimals === undefined || scale === undefined
    || rateNumerator === undefined || rateDenominator === undefined || adminId === undefined) {
    throw badRequest('New currencies require name, namePlural, symbol, decimals, scale, rateNumerator, rateDenominator and adminUser')
  }
  return {
    id: source.id,
    code: source.code,
    name,
    namePlural,
    symbol,
    decimals,
    scale,
    rate: { n: rateNumerator, d: rateDenominator },
    status: 'active',
    admins: [{ id: adminId }],
    settings: resolveSettings(source.settings, new Map(bundle.accounts.map(account => [account.code, account.id]))) as Partial<CurrencySettings>,
  }
}

/** Validate all final balances and ledger precision before creating a currency or any accounts. */
export const validateNewCurrency = (bundle: ResolvedBundle) => {
  const currency = currencyInput(bundle)
  const accountIds = new Map(bundle.accounts.map(account => [account.code, account.id]))
  const settings = { ...defaultCurrencySettings(currency), ...currency.settings }
  const ledgerAmount = (amount: bigint) => validateLedgerAmount(amount, currency.scale)
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'number' && /CreditLimit|MaximumBalance/.test(key)) {
      ledgerAmount(BigInt(value))
    }
  }
  let disabledBalance = 0n
  for (const account of bundle.accounts) {
    const balance = BigInt(bundle.balances[account.code])
    const credit = BigInt(account.creditLimit ?? settings.defaultInitialCreditLimit)
    // An omitted account maximum is unlimited, even if new accounts normally inherit a currency default.
    const maximum = account.maximumBalance === undefined ? undefined : BigInt(account.maximumBalance)
    if (balance < -credit || (maximum !== undefined && balance > maximum)) {
      throw badRequest(`Account ${account.code}: history exceeds account limits`)
    }
    ledgerAmount(balance < 0n ? -balance : balance)
    ledgerAmount(credit)
    ledgerAmount(balance + credit)
    if (maximum !== undefined) {
      ledgerNumber(maximum)
      ledgerAmount(maximum + credit)
    }
    if (account.status === 'disabled' || account.status === 'suspended') {
      disabledBalance += balance + credit
    }
    resolveSettings(account.settings, accountIds)
  }
  ledgerAmount(disabledBalance)
}

function conflict(label: string): never {
  throw badRequest(`${label}: supplied accounting data conflicts with existing records`)
}

const compareSettings = (
  code: string,
  supplied: AccountingBundle['currency']['settings'],
  existing: unknown,
  accountIds: ReadonlyMap<string, string>,
) => {
  const current = existing as Record<string, unknown>
  for (const [key, value] of Object.entries(resolveSettings(supplied, accountIds))) {
    if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
      conflict(`${code} setting ${key}`)
    }
  }
}

/** Match history as a multiset: otherwise two identical rows could reuse the same stored transfer. */
const compareHistory = (bundle: AccountingBundle, history: TransferRecord[], accountIds: ReadonlyMap<string, string>) => {
  if (history.length !== bundle.transfers.length) {
    conflict('Complete transfer history')
  }
  const remaining = new Map<string, Set<string>>()
  for (const transfer of history) {
    const signature = transferSignature({
      payer: transfer.payerId,
      payee: transfer.payeeId,
      user: transfer.userId,
      amount: transfer.amount.toString(),
      createdAt: transfer.created.toISOString(),
      updatedAt: transfer.updated.toISOString(),
      description: (transfer.meta as { description?: string } | null)?.description ?? '',
    })
    const ids = remaining.get(signature) ?? new Set<string>()
    ids.add(transfer.id)
    remaining.set(signature, ids)
  }
  for (const source of bundle.transfers) {
    const signature = transferSignature({
      ...source,
      payer: accountIds.get(source.payer)!,
      payee: accountIds.get(source.payee)!,
    })
    const matches = remaining.get(signature)
    const id = source.id ?? matches?.values().next().value
    if (!id || !matches?.delete(id)) {
      conflict('Historical transfer')
    }
  }
}

/** Validate supplied facts against existing records and return a bundle with their canonical IDs. */
export const reconcileExistingCurrency = async (service: BaseService, bundle: AccountingBundle) => {
  const db = service.tenantDb(bundle.currency.code)
  const currency = await db.currency.findUniqueOrThrow({ where: { code: bundle.currency.code } })
  if (bundle.currency.id && currency.id !== bundle.currency.id) {
    conflict('Currency UUID')
  }
  if (bundle.currency.adminId && currency.adminId !== bundle.currency.adminId) {
    conflict('Currency administrator')
  }
  for (const key of ['name', 'namePlural', 'symbol', 'decimals', 'scale'] as const) {
    if (bundle.currency[key] !== undefined && currency[key] !== bundle.currency[key]) {
      conflict(`Currency ${key}`)
    }
  }
  if (bundle.currency.rateNumerator !== undefined && currency.rateN !== bundle.currency.rateNumerator) {
    conflict('Currency rate')
  }
  if (bundle.currency.rateDenominator !== undefined && currency.rateD !== bundle.currency.rateDenominator) {
    conflict('Currency rate')
  }
  const records = await db.account.findMany({ where: { kind: 'user' }, include: { users: true } })
  const byCode = new Map(records.map(account => [account.code, account]))
  const reuseLedger = hasStellarKeys(bundle)
  const accounts = bundle.accounts.map(source => {
    const account = byCode.get(source.code)
    if (!account || (source.id && source.id !== account.id)) {
      conflict(`Account ${source.code}`)
    }
    if (reuseLedger && source.status !== account.status) {
      conflict(`Account ${source.code} status`)
    }
    if (source.users.some(user => !account.users.some(owner => owner.userId === user))) {
      conflict(`Account ${source.code} owners`)
    }
    for (const key of ['balance', 'creditLimit', 'maximumBalance'] as const) {
      const value = source[key]
      if (value !== undefined && BigInt(value) !== account[key]) {
        conflict(`Account ${source.code} ${key}`)
      }
    }
    return { ...source, id: account.id }
  })
  const resolved = resolveBundle({ ...bundle, currency: { ...bundle.currency, id: currency.id }, accounts })
  const accountIds = new Map(resolved.accounts.map(account => [account.code, account.id]))
  compareSettings(currency.code, resolved.currency.settings, currency.settings, accountIds)
  for (const source of resolved.accounts) {
    compareSettings(source.code, source.settings, byCode.get(source.code)!.settings, accountIds)
  }
  if (bundle.transfers.length || bundle.accounts.some(account => account.balance !== undefined)) {
    const history = await db.transfer.findMany({ where: { state: 'committed' } })
    compareHistory(bundle, history, accountIds)
  }
  return resolved
}

const transferSignature = (transfer: Omit<AccountingBundle['transfers'][number], 'id'>) => JSON.stringify([
  transfer.payer, transfer.payee, transfer.user, transfer.amount,
  transfer.createdAt, transfer.updatedAt, transfer.description,
])
