
import { Context } from "src/utils/context";
import { CurrencyController, SharedController } from "..";
import { CreateMigration, Migration } from "./migration";
import { FullAccount, CreateCurrency, Currency, InputTransfer, FullTransfer, User } from "src/model";
import { logger } from "src/utils/logger";
import { fixUrl } from "src/utils/net";

/**
 * Migrate a currency from IntegralCES to Komunitin accounting.
 * 
 * This is a very basic implementation just to use the demo data from ICES,
 * still not ready for migrating real data.
 * 
 * @param ctx Context
 * @param controller Shared controller
 * @param migration Migration data
 */
export async function migrateFromIntegralces(ctx: Context, controller: SharedController, migration: CreateMigration) : Promise<Migration> {
  // TODO's:
  // - Pagination
  // - Resume crashed migrations (also with new access token)
  // - Handle deleted accounts
  // - Test real data
  
  
  // Migrate the currency
  const currency = await migrateCurrency(ctx, controller, migration)
  logger.info(`Migrated currency ${currency.code}`)
  // Migrate accounts
  const currencyController = await controller.getCurrencyController(currency.code)
  const accounts = await migrateAccounts(ctx, currencyController, migration, currency)
  logger.info(`Migrated ${accounts.length} accounts`)
  // Migrate transfers.
  const transfers = await migrateTransfers(ctx, currencyController, migration, currency, accounts)
  logger.info(`Migrated ${transfers.length} transfers`)

  return {
    id: "",
    type: "migrations",
    code: migration.code,
    status: "completed",
    source: migration.source,
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  }
}

const gcd = (a: number, b: number): number => b == 0 ? a : gcd(b, a % b)

const get = async (url: string, token?: string) => {
  const response = await fetch(fixUrl(url), {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  })

  return await response.json() as any
}

const socialUrl = (source: string) => {
  return `${source}/ces/api/social`
}

const accountingUrl = (source: string) => {
  return `${source}/ces/api/accounting`
}


async function migrateCurrency(ctx: Context, controller: SharedController, migration: CreateMigration) {
  // Get the user Id. We get the full UUID from the API, where the ctx.userId is the Drupal user id.
  const socialBase = socialUrl(migration.source.url)
  const adminUrl = `${socialBase}/users/me`
  const adminDoc = await get(adminUrl, migration.source.access_token)
  const adminId = adminDoc.data.id
  
  // Get the currency
  const base = accountingUrl(migration.source.url)
  const url = `${base}/${migration.code}/currency`
  const doc = await get(url, migration.source.access_token)
  const resource = doc.data
  const d = gcd(resource.attributes.value, 10**6)
  const model: CreateCurrency = {
    id: resource.id,
    ...resource.attributes,
    // in integralces we have the rate as a single number.
    rate: {
      n: resource.attributes.value / d,
      d: (10 ** 6) / d
    },
    settings: {
      // Default of 10h of initial credit. 
      // TODO: better handle this!
      defaultInitialCreditLimit: 10 * (10**6 / resource.attributes.value) * Math.pow(10, resource.attributes.scale),
      enableExternalPaymentRequests: true,
      enableExternalPayments: true,
      defaultAllowExternalPayments: true,
      defaultAllowExternalPaymentRequests: true,
      // Allow tag payments (useful in demo)
      defaultAllowTagPaymentRequests: true,
      defaultAllowTagPayments: true,
    },
    admins: [ {id: adminId} ]
  }

  const currency = await controller.createCurrency(ctx, model)
  return currency
}

async function migrateAccounts(ctx: Context, controller: CurrencyController, migration: CreateMigration, currency: Currency) {
  // The route to get the users owning accounts is a bit involved. We need to get all "members" of a group,
  // then get all accounts and users for each member.
  const socialBase = socialUrl(migration.source.url)
  const accountingBase = accountingUrl(migration.source.url)

  const membersUrl = `${socialBase}/${migration.code}/members`
  // TODO: pagination
  const accounts = [] as FullAccount[]
  const members = await get(membersUrl, migration.source.access_token)
  for (const member of members.data) {
    const accountId = member.relationships.account.data.id
    // External related resource link.
    // Note that we can't use the provided link as since the thwo services may be under the same
    // reverse proxy, the public URL may not be accessible from here.
    const accountUrl = `${accountingBase}/${migration.code}/accounts/${accountId}`
    // get the account with settings
    const doc = await get(`${accountUrl}?include=settings`, migration.source.access_token)
    const resource = doc.data
    const included = doc.included
    const settings = included.find((i: any) => i.type === 'account-settings')
    // now fetch user
    const userUrl = `${socialBase}/users?filter[members]=${member.id}`
    const users = await get(userUrl, migration.source.access_token)
    // TODO: handle multiple users.
    const user = users.data[0]
    
    // Create the account
    const model = {
      id: accountId,
      users: [{id: user.id}],
      code: resource.attributes.code,
      creditLimit: resource.attributes.creditLimit === -1 ? undefined : resource.attributes.creditLimit,
      maximumBalance: resource.attributes.debitLimit === -1 ? undefined : resource.attributes.debitLimit,
      settings: {
        acceptPaymentsAutomatically: settings.attributes.acceptPaymentsAutomatically,
      }
    }
    const account = await controller.accounts.createAccount(ctx, model)
    accounts.push(account)
  }
  return accounts
}

async function migrateTransfers(ctx: Context, controller: CurrencyController, migration: CreateMigration, currency: Currency, accounts: FullAccount[]) {
  const base = accountingUrl(migration.source.url)
  const url = `${base}/${migration.code}/transfers`
  // TODO: pagination
  const doc = await get(url, migration.source.access_token)
  const transfers = doc.data
  const migrated = [] as FullTransfer[]
  for (const transfer of transfers) {
    const payer = accounts.find(a => a.id === transfer.relationships.payer.data.id)
    const payee = accounts.find(a => a.id === transfer.relationships.payee.data.id)
    if (!payer || !payee) {
      logger.warn(`Skipping transfer ${transfer.id} with unknown payer or payee`)
      continue
    }
    const model: InputTransfer = {
      id: transfer.id,
      amount: transfer.attributes.amount,
      meta: transfer.attributes.meta,
      state: transfer.attributes.state,
      payer: transfer.relationships.payer.data,
      payee: transfer.relationships.payee.data,
      // TODO (or not): migrate user
      user: currency.admin,
      // TODO: migrate created/updated transfers.
      //created: new Date(transfer.attributes.created),
      //updated: new Date(transfer.attributes.updated)
    }
    migrated.push(await controller.transfers.createTransfer(ctx, model))
  }
  return migrated
}
