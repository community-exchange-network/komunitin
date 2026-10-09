import type { CurrencyControllerImpl } from '../controller/currency-controller'
import type { BaseService, CurrencyService } from '../controller'
import type { TenantPrismaClient } from '../controller/multitenant'
import { systemContext } from '../utils/context'
import { badRequest } from '../utils/error'
import type { ResolvedBundle } from './bundle'
import { currencyInput, resolveSettings } from './currency'
import { loadKeys, storeAccountKeys, type LoadedMigrationKeys, type MigrationKeys } from './keys'
import { captureCurrencyState, reconcileAccounts } from './ledger'
import { migrationJson, type ApiMigration, type MigrationLogger } from './migration'

const dates = (row: { createdAt: string, updatedAt: string }) => ({
  created: new Date(row.createdAt),
  updated: new Date(row.updatedAt),
})

/** Restore the database projection and reconcile the ledger from the durable bundle. */
export const importCurrency = async (
  service: BaseService,
  migration: Pick<ApiMigration, 'id' | 'code'>,
  bundle: ResolvedBundle,
  storedKeys: MigrationKeys,
  log: MigrationLogger,
) => {
  const db = service.tenantDb(migration.code)
  const accountIds = new Map(bundle.accounts.map(account => [account.code, account.id]))
  const keys = await loadKeys(service, migration.code, storedKeys)
  const currencyRecord = await db.currency.findUnique({ where: { code: migration.code } })
  if (!currencyRecord) {
    await service.createCurrency(systemContext(), currencyInput(bundle), keys.currency)
  } else if (currencyRecord.id !== bundle.currency.id || currencyRecord.status !== 'active') {
    throw badRequest('Currency is not ready for resuming the migration; resolve manually')
  }
  // Capture the external-trade cursor before constructing a controller, which opens ledger streams.
  if (!currencyRecord?.state) {
    await captureCurrencyState(service, migration.code, keys.currency.externalTrader.publicKey())
  }
  const controller = await service.getCurrencyController(migration.code) as CurrencyControllerImpl
  await storeAccountKeys(controller, keys)
  const currency = await controller.getCurrency(systemContext())
  await controller.accounts.updateAccountBalance(currency.externalAccount)
  await log('currency', 'Currency ready')

  await importAccounts(controller, bundle, keys, accountIds)
  await log('accounts', `${bundle.accounts.length} accounts ready`)
  await importTransfers(db, migration, bundle, accountIds)
  await log('transfers', `${bundle.transfers.length} historical transfers ready`)
  await reconcileAccounts(controller, bundle, log)

  // Provisioning updates timestamps. Restore the snapshot dates only after all account writes finish.
  for (const source of bundle.accounts) {
    await db.account.update({ where: { id: source.id }, data: dates(source) })
  }
  await db.currency.update({
    where: { id: currency.id },
    data: {
      settings: migrationJson({ ...currency.settings, ...resolveSettings(bundle.currency.settings, accountIds) }),
      ...dates(bundle.currency),
    },
  })
  await log('balances', 'Ledger balances and account statuses established')
}

const importAccounts = async (
  controller: CurrencyService,
  bundle: ResolvedBundle,
  keys: LoadedMigrationKeys,
  accountIds: ReadonlyMap<string, string>,
) => {
  const { db, model: currency } = controller
  // Initiators need not currently own an account. Preserve their canonical identity without re-authorization.
  await db.user.createMany({ data: bundle.users.map(id => ({ id })), skipDuplicates: true })
  for (const source of bundle.accounts) {
    let account = await db.account.findUnique({ where: { id: source.id } })
    if (!account) {
      account = await db.account.create({
        data: {
          id: source.id,
          code: source.code,
          currencyId: currency.id,
          kind: 'user',
          keyId: keys.accounts[source.id].publicKey(),
          status: source.status,
          balance: BigInt(bundle.balances[source.code]),
          creditLimit: BigInt(source.creditLimit ?? currency.settings.defaultInitialCreditLimit),
          maximumBalance: source.maximumBalance === undefined ? null : BigInt(source.maximumBalance),
          users: { create: source.users.map(userId => ({ userId })) },
        },
      })
    }
    if (account.code !== source.code) {
      throw badRequest(`Account ${source.code}: UUID conflict`)
    }
    await db.account.update({
      where: { id: source.id },
      data: { settings: migrationJson(resolveSettings(source.settings, accountIds)) },
    })
  }
}

const importTransfers = async (
  db: TenantPrismaClient,
  migration: Pick<ApiMigration, 'id' | 'code'>,
  bundle: ResolvedBundle,
  accountIds: ReadonlyMap<string, string>,
) => {
  // Insert history directly: replaying it through the transfer controller would move ledger funds again.
  for (const source of bundle.transfers) {
    const payerId = accountIds.get(source.payer)!
    const payeeId = accountIds.get(source.payee)!
    const existing = await db.transfer.findUnique({
      where: { tenantId_id: { tenantId: migration.code, id: source.id } },
    })
    if (existing) {
      if (existing.payerId !== payerId || existing.payeeId !== payeeId || existing.amount !== BigInt(source.amount)
        || existing.userId !== source.user || existing.state !== 'committed') {
        throw badRequest(`Transfer ${source.id}: conflict`)
      }
    } else {
      await db.transfer.create({
        data: {
          id: source.id,
          payerId,
          payeeId,
          userId: source.user,
          amount: BigInt(source.amount),
          state: 'committed',
          meta: { description: source.description, migration: { id: migration.id } },
          ...dates(source),
        },
      })
    }
  }
}
