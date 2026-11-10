import { currencyData, type CurrencyControllerImpl } from '../controller/currency-controller'
import type { BaseService } from '../controller'
import type { StellarAccount } from '../ledger/stellar/account'
import type { StellarCurrency } from '../ledger/stellar/currency'
import type { StellarLedger } from '../ledger/stellar/ledger'
import Big from 'big.js'
import { exactAmount, ledgerNumber } from './amounts'
import type { ResolvedBundle } from './bundle'
import type { MigrationLogger } from './migration'

// Stellar's default trustline limit is the largest signed 64-bit amount in seven-decimal units.
const unlimitedTrustline = '922337203685.4775807'

// Horizon always returns seven decimals, including zeros beyond the currency's scale.
const integerBalance = (controller: CurrencyControllerImpl, amount: string) =>
  exactAmount(amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''), controller.model.scale)

/** Start external-trade synchronization at the snapshot, before opening any ledger streams. */
export const captureCurrencyState = async (service: BaseService, code: string, externalTrader: string) => {
  const ledger = service.ledger as StellarLedger
  const trades = await ledger.callServer(server => server.trades().forAccount(externalTrader).order('desc').limit(1).call())
  await service.tenantDb(code).currency.update({
    where: { code },
    data: { state: { externalTradesStreamCursor: trades.records[0]?.paging_token ?? '0' } },
  })
}

/** Adjust only the live difference, so retrying after a lost response cannot double-fund an account. */
const reconcileBalance = async (
  controller: CurrencyControllerImpl,
  account: StellarAccount,
  publicKey: string,
  target: bigint,
  log: MigrationLogger,
) => {
  const current = integerBalance(controller, account.balance())
  const difference = target - current
  if (difference !== 0n) {
    const targetAmount = controller.toStringAmount(ledgerNumber(target))
    const accountKey = await controller.keys.retrieveKey(publicKey)
    const sponsor = await controller.keys.sponsorKey()
    // Raise the trustline before funding; the final configured maximum is applied afterwards.
    if (Big(account.maximumBalance()).lt(targetAmount)) {
      await account.updateMaximumBalance(targetAmount, {
        account: accountKey,
        sponsor,
      })
    }
    const increase = difference > 0n
    const issuer = controller.model.keys.issuer
    const payer = increase ? await controller.ledger.getAccount(issuer) : account
    const transfer = await payer.pay({
      payeePublicKey: increase ? publicKey : issuer,
      amount: controller.toStringAmount(ledgerNumber(increase ? difference : -difference)),
    }, {
      account: increase ? await controller.keys.issuerKey() : accountKey,
      sponsor,
    })
    await log('balances', `Adjusted Stellar account ${publicKey} from ${current} to ${target} scaled units; transaction ${transfer.hash}`)
  }
}

/** Rebuild ledger balances and statuses from complete history, including the shared disabled-account pool. */
export const reconcileAccounts = async (controller: CurrencyControllerImpl, bundle: ResolvedBundle, log: MigrationLogger) => {
  const currency = controller.model
  const ledger = controller.ledger as StellarCurrency
  ledger.setData(currencyData(currency))
  const records = await controller.db.account.findMany({ where: { kind: 'user' } })
  const byId = new Map(records.map(account => [account.id, account]))
  const hasDisabled = bundle.accounts.some(account => account.status === 'disabled' || account.status === 'suspended')
  if (hasDisabled) {
    await controller.createDisabledAccountsPool()
  }

  for (const source of bundle.accounts) {
    const record = byId.get(source.id)!
    let account = await ledger.findAccount(record.keyId)
    const balance = BigInt(bundle.balances[source.code])
    // Stellar balances cannot be negative: credit shifts both the balance and its upper limit.
    const target = balance + record.creditLimit
    const maximum = record.maximumBalance === null
      ? undefined
      : controller.toStringAmount(ledgerNumber(record.maximumBalance + record.creditLimit))
    if (!account && source.status === 'active') {
      await ledger.createAccount({
        initialCredit: controller.toStringAmount(ledgerNumber(record.creditLimit)),
        maximumBalance: maximum,
      }, {
        issuer: await controller.keys.issuerKey(),
        sponsor: await controller.keys.sponsorKey(),
        credit: record.creditLimit > 0n ? await controller.keys.creditKey() : undefined,
        account: await controller.keys.retrieveKey(record.keyId),
      })
      account = await ledger.getAccount(record.keyId)
    }
    if (account) {
      account.validate({ trustline: true, admin: currency.keys.admin })
      await reconcileBalance(controller, account, record.keyId, target, log)
      await account.update()
      if (source.status === 'active') {
        if (!Big(account.maximumBalance()).eq(maximum ?? unlimitedTrustline)) {
          await account.updateMaximumBalance(maximum, {
            account: await controller.keys.retrieveKey(record.keyId),
            sponsor: await controller.keys.sponsorKey(),
          })
        }
      } else if (source.status === 'deleted') {
        await account.delete({
          admin: await controller.keys.adminKey(),
          sponsor: await controller.keys.sponsorKey(),
        })
      } else {
        await account.disable({
          admin: await controller.keys.adminKey(),
          sponsor: await controller.keys.sponsorKey(),
        })
      }
    }
  }

  const poolKey = currency.keys.disabledAccountsPool
  const pool = poolKey ? await ledger.findAccount(poolKey) : null
  if (pool && poolKey) {
    // Reconcile the pool last: disabling individual accounts may have moved funds into it.
    const disabled = await controller.db.account.findMany({
      where: { status: { in: ['disabled', 'suspended'] }, kind: 'user' },
    })
    const target = disabled.reduce((sum, account) => sum + account.balance + account.creditLimit, 0n)
    pool.validate({ trustline: true, admin: currency.keys.admin })
    await reconcileBalance(controller, pool, poolKey, target, log)
  }
}
