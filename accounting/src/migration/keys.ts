import { Keypair } from '@stellar/stellar-sdk'
import type { BaseService, CurrencyService } from '../controller'
import type { LedgerCurrencyKeys } from '../ledger'
import { decrypt, encrypt, randomKey } from '../utils/crypto'
import { badRequest } from '../utils/error'
import type { AccountingBundle, ResolvedBundle } from './bundle'
import { currencyKeyRoles, currencySecretColumns } from './format'

type MigrationSecrets = {
  currency: Record<keyof LedgerCurrencyKeys, string>
  accounts: Record<string, string>
}

/** A migration owns its encrypted checkpoint independently of the currency's key store. */
export type MigrationKeys = {
  encryptionKeyId: string
  encryptedSecrets: string
}

/** Supplied keys request ledger reconciliation even when the database records already exist. */
export const hasStellarKeys = (bundle: AccountingBundle) =>
  currencyKeyRoles.some(role => bundle.currency[currencySecretColumns[role]]) || bundle.accounts.some(account => account.stellarSecret)

/** Return an encrypted key checkpoint and a copy of the bundle with plaintext secrets removed. */
export const prepareKeys = async (service: BaseService, bundle: ResolvedBundle) => {
  const db = service.tenantDb(bundle.currency.code)
  const currency = await db.currency.findUnique({ where: { code: bundle.currency.code } })
  const controller = currency ? await service.getCurrencyController(currency.code) : undefined
  const records = await db.account.findMany({ where: { kind: 'user' } })
  const accountsById = new Map(records.map(account => [account.id, account]))
  const resolve = async (secret: string | undefined, existing: string | null | undefined, label: string) => {
    let key: Keypair
    if (secret) {
      key = Keypair.fromSecret(secret)
    } else if (existing) {
      // An existing key ID came from this currency's records, so its controller is available.
      key = await controller!.keys.retrieveKey(existing)
    } else {
      key = Keypair.random()
    }
    if (existing && key.publicKey() !== existing) {
      throw badRequest(`${label}: Stellar key conflicts with existing record`)
    }
    return key.secret()
  }
  const secrets: MigrationSecrets = { currency: {} as MigrationSecrets['currency'], accounts: {} }
  const currencyWithoutSecrets = { ...bundle.currency }
  for (const role of currencyKeyRoles) {
    const column = currencySecretColumns[role]
    secrets.currency[role] = await resolve(bundle.currency[column], currency?.[`${role}KeyId`], `Currency ${role}`)
    delete currencyWithoutSecrets[column]
  }
  for (const account of bundle.accounts) {
    secrets.accounts[account.id] = await resolve(account.stellarSecret, accountsById.get(account.id)?.keyId, `Account ${account.code}`)
  }
  const publicKeys = [...Object.values(secrets.currency), ...Object.values(secrets.accounts)].map(secret => Keypair.fromSecret(secret).publicKey())
  if (new Set(publicKeys).size !== publicKeys.length) {
    throw badRequest('Duplicate Stellar key')
  }
  const collisions = await service.privilegedDb().encryptedSecret.count({
    where: { id: { in: publicKeys }, tenantId: { not: bundle.currency.code } },
  })
  if (collisions) {
    throw badRequest('Stellar key belongs to another community')
  }

  // This key must survive a failure before the currency and its own key store are created.
  const encryptionKey = await randomKey()
  const { id: encryptionKeyId } = await service.storeEncryptionKey(bundle.currency.code, encryptionKey)
  return {
    keys: { encryptionKeyId, encryptedSecrets: await encrypt(JSON.stringify(secrets), encryptionKey) },
    bundle: {
      ...bundle,
      currency: currencyWithoutSecrets,
      accounts: bundle.accounts.map(({ stellarSecret, ...account }) => account),
    },
  }
}

/** Decrypt the checkpoint only while running the migration. Core services receive ordinary keys. */
export const loadKeys = async (service: BaseService, code: string, stored: MigrationKeys) => {
  const encryptionKey = await service.retrieveEncryptionKey(code, stored.encryptionKeyId)
  const secrets = JSON.parse(await decrypt(stored.encryptedSecrets, encryptionKey)) as MigrationSecrets
  return {
    currency: Object.fromEntries(currencyKeyRoles.map(role => [role, Keypair.fromSecret(secrets.currency[role])])) as Required<LedgerCurrencyKeys>,
    accounts: Object.fromEntries(Object.entries(secrets.accounts).map(([id, secret]) => [id, Keypair.fromSecret(secret)])),
  }
}

export type LoadedMigrationKeys = Awaited<ReturnType<typeof loadKeys>>

/** Store account and pool keys under the currency's own encryption key, including on resume. */
export const storeAccountKeys = async (controller: CurrencyService, keys: LoadedMigrationKeys) => {
  for (const key of [keys.currency.disabledAccountsPool, ...Object.values(keys.accounts)]) {
    const existing = await controller.db.encryptedSecret.findUnique({ where: { id: key.publicKey() } })
    if (!existing) {
      await controller.keys.storeKey(key)
    }
  }
  const poolKey = keys.currency.disabledAccountsPool.publicKey()
  if (controller.model.keys.disabledAccountsPool !== poolKey) {
    await controller.db.currency.update({
      where: { id: controller.model.id },
      data: { disabledAccountsPoolKeyId: poolKey },
    })
    controller.model.keys.disabledAccountsPool = poolKey
  }
}
