import { Keypair } from "@stellar/stellar-sdk";
import { LedgerCurrencyController } from "../controller/currency-controller";
import { TenantPrismaClient } from "../controller/multitenant";
import { StellarCurrency } from "../ledger/stellar";
import { AccountStatus, FullAccount, recordToAccount, TransferMeta, TransferStates } from "../model";
import { systemContext } from "../utils/context";
import { fixUrl } from "../utils/net";
import { Migration, MigrationAccount, MigrationData, MigrationLogEntry, MigrationTransfer } from "./migration";
import { MigrationController } from "./migration-controller";

const UNLIMITED_CREDIT_LIMIT = 10 ** 6

interface ICESMigration extends Migration {
  kind: "integralces-accounting";
  data: MigrationData & {
    source: {
      url: string,
      tokens: {
        refreshToken?: string,
        accessToken: string,
        expiresAt: string
      }
    },
    step: string
  } 
}

/**
 * Calls all promiseswith a concurrency limit.
 */
const promisePool = async <T, U>(
  items: T[],
  fn: (item: T) => Promise<U>,
  concurrency = 10
): Promise<U[]> => {
  let index = 0
  const results: U[] = new Array(items.length)
  let stop = false
  const worker = async (): Promise<void> => {
    while (!stop && index < items.length) {
      const currentIndex = index++
      try {
        results[currentIndex] = await fn(items[currentIndex])
      } catch (error) {
        stop = true;
        throw error
      }
    }
  }
  
  await Promise.all(Array(Math.min(concurrency, items.length)).fill(0).map(worker))
  return results
}

export class ICESMigrationController {

  public steps = ["validate", "get-currency", "get-accounts", "get-transfers", 
    "disable-inactive-accounts", "create-currency", "create-accounts", 
    "create-transfers", "set-balances", "set-disabled-members", "end"]

  public omitStepsInTestMode = ["set-disabled-members"]

  constructor(private readonly controller: MigrationController, private readonly migration: ICESMigration) {}

  static isICESMigration(migration: Migration): migration is ICESMigration & { kind: "integralces-accounting" } {
    return migration.kind === "integralces-accounting";
  }

  async log(message: string, data?: any) {
    this.controller.addLogEntry(this.migration, "info", this.migration.data.step, message, data)
  }

  async warn(message: string, data?: any) {
    this.controller.addLogEntry(this.migration, "warn", this.migration.data.step, message, data)
  }

  async beforeAll() {
    const currencyController = await this.controller.controller.getCurrencyController(this.migration.code) as LedgerCurrencyController;
    const db = this.controller.controller.tenantDb(this.migration.code)
    const accounts = await db.account.findMany({})
    const data = []
    for (const account of accounts) {
      const computedBalance = await this.computeAccountBalance(db, account)
      data.push({
        code: account.code,
        status: account.status,
        balanceDb: Number(currencyController.amountToLedger(Number(account.balance))),
        computedBalance: Number(currencyController.amountToLedger(Number(computedBalance))),
        difference: Number(currencyController.amountToLedger(Number(account.balance - computedBalance)))
      })
    }
    console.table(data)
    const sums = data.reduce((acc, curr) => {
      acc.balanceDb += curr.balanceDb
      acc.computedBalance += curr.computedBalance
      acc.difference += curr.difference
      return acc
    }, { balanceDb: 0, computedBalance: 0, difference: 0 })
    console.table(sums)
    //throw new Error("Aborting!")

  }

  async play() {    
    //await this.beforeAll()
    await this.controller.setMigrationStatus(this.migration.id, "started")
    await this.log("Starting migration process")
    const currentStep = this.migration.data.step || this.steps[0]
    const index = this.steps.indexOf(currentStep)
    if (index === -1) {
      throw new Error(`Unknown migration step: ${currentStep}`)
    }
    try {
      for (let i = index; i < this.steps.length; i++) {
        const step = this.steps[i];
        this.migration.data.step = step
        await this.controller.updateMigrationData(this.migration.id, { step })
        if (this.migration.data.test && this.omitStepsInTestMode.includes(step)) {
          await this.log(`Skipping step ${step} in test mode`)
          continue
        } 
        await this.log(`Starting migration step ${step}`)
        await this.runStep(step)
        await this.log(`Migration step ${step} completed`)
      }

      this.migration.status = "completed"
      await this.controller.setMigrationStatus(this.migration.id, "completed")
      await this.log("Migration process completed successfully")
    
    } catch (error) {
      console.error(error)
      
      let message = "unknown error"
      if (error instanceof Error) {
        message = error.message
      }
      await this.controller.addLogEntry(this.migration, "error", this.migration.data.step, message, { error })
      this.migration.status = "failed"
      await this.controller.setMigrationStatus(this.migration.id, "failed")
    }
  }

  private async runStep(step: string) {
    switch (step) {
      case "validate":
        return await this.validate()
      case "get-currency":
        return await this.getCurrency()
      case "get-accounts":
        return await this.getAccounts()
      case "get-transfers":
        return await this.getTransfers()
      case "disable-inactive-accounts":
        return await this.disableInactiveAccounts()
      case "create-currency":
        return await this.createCurrency()
      case "create-accounts":
        return await this.createAccounts()
      case "create-transfers":
        return await this.createTransfers()
      case "set-balances":
        return await this.setBalances()
      case "set-disabled-members":
        return await this.setDisabledMembers()
      case "end":
        await this.log("Migration process ended :)")
        return
      default:
        throw new Error(`Unknown step ${step}`)  
    }
  }

  private async getAccessToken() {
    const tokens = this.migration.data.source.tokens;

    const isAccessTokenValid = tokens.accessToken && new Date(tokens.expiresAt) > new Date();
    const shouldRefresh = !!tokens.refreshToken && (!tokens.accessToken || new Date(tokens.expiresAt) < new Date(Date.now() - 5 * 60 * 1000));
    
    if (shouldRefresh) {
      const authUrl = `${this.migration.data.source.url}/oauth2/token`
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken as string,
        client_id: "komunitin-app",
        scope: "komunitin_social komunitin_accounting",
      });
      const response = await fetch(fixUrl(authUrl), {
        method: "POST",
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
      const data = await response.json() as any
      if (!response.ok) {
        throw new Error(`Failed to get access token: ${data.error || "Unknown error"}`)
      }

      // Update the migration with the new access token, expiration and refresh token
      this.migration.data.source.tokens = {
        accessToken: data.access_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        refreshToken: data.refresh_token
      }

      await this.controller.updateMigrationData(this.migration.id, {
        source: this.migration.data.source
      })
      
      await this.log("Access token refreshed")
    } else if (!isAccessTokenValid) {
      throw new Error("Access token unavailable or expired, and no refresh token provided")
    }
    return this.migration.data.source.tokens.accessToken
  }

  private socialUrl = () => {
    return `${this.migration.data.source.url}/ces/api/social`
  }

  private accountingUrl = () => {
    return `${this.migration.data.source.url}/ces/api/accounting`
  }

  private async get(url: string) {
    return await this.fetch("GET", url)
  }

  private async patch(url: string, data: any) {
    return await this.fetch("PATCH", url, data)
  }

  private async fetch(method: string, url: string, data?: any) {
    const token = await this.getAccessToken()
    const response = await fetch(fixUrl(url), {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(data ? { 'Content-Type': 'application/json' } : {})
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    if (!response.ok) {
      const errorDoc = await response.json() as any
      const errors = errorDoc.errors || []
      const errorObject = errors.length > 0 ? errors[0] : { title: "Unknown error", detail: "An unknown error occurred" }
      throw new Error(`Failed to ${method} to ${url}: ${errorObject.detail || errorObject.title}`, {
        cause: errorObject
      })
    }
    return await response.json() as any
  }

  private async validate() {
    const response = await this.get(`${this.accountingUrl()}/${this.migration.code}/currency`)
    if (!response.data || !response.data.attributes || !response.data.attributes.code) {
      throw new Error("Invalid response from accounting service")
    }
    await this.log("Migration source and token validated successfully")
  }

  private async getCurrency() {
    // Fetch currency object
    const url = `${this.accountingUrl()}/${this.migration.code}/currency?include=settings`
    const response = await this.get(url)
    if (!response.data || !response.included) {
      throw new Error("Invalid response from accounting service")
    }
    const currency = response.data
    const settings = response.included.find((i: any) => i.type === 'currency-settings')
    if (!settings) {
      throw new Error("Currency settings not found in response")
    }
    
    await this.log(`Currency ${currency.attributes.code} fetched successfully`, this.migration.data.currency)

    // Fetch admin from social service
    const groupUrl = `${this.socialUrl()}/${this.migration.code}`
    const groupResponse = await this.get(groupUrl)
    const admins = groupResponse.data.relationships.admins.data
    if (!admins || admins.length === 0) {
      throw new Error("No admins found for the group")
    }
    await this.log(`${admins.length} admins found for the group`)

    this.migration.data.currency = {
      id: currency.id,
      ...currency.attributes,
      settings: {
        ...settings.attributes,
      },
      admins: admins.map((admin: any) => ({ id: admin.id }))
    }
  
    await this.controller.updateMigrationData(this.migration.id, { currency: this.migration.data.currency })
    await this.log(`Currency ${currency.attributes.code} fetched successfully`)
  }

  private async getAccounts() {
    // fetch all accounts (including virtual and blocked/hidden/etc)
    const accountsUrl = `${this.accountingUrl()}/${this.migration.code}/accounts`

    const params = new URLSearchParams({
      "filter[state]": "0,1,2,3,4,5",
      "filter[kind]": "0,1,2,3,4,5",
      "include": "settings",
      "page[size]": "20"
    })
    const accounts: any[] = []
    let response: any;
    do {
      params.set("page[after]", "" + accounts.length)
      response = await this.get(`${accountsUrl}?${params.toString()}`)
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error("Invalid response from accounting service")
      }
      for (const accountData of response.data) {
        const settingsData = response.included.find((i: any) => i.type === 'account-settings' && i.id === accountData.relationships.settings.data.id)
        const account = {
          id: accountData.id,
          ...accountData.attributes,
          settings: {
            ...settingsData.attributes,
          }
        }
        accounts.push(account)
      }
      await this.log(`Fetched ${accounts.length} accounts so far`)
    } while (response.links && response.links.next !== null);

    await this.log("Finished fetching accounts")
    // fetch account users. In order to do this, we need to fetch the members of the group
    // and then get the member users and relate them to the account.
    const socialBase = this.socialUrl()
    const membersUrl = `${socialBase}/${this.migration.code}/members`
    
    const membersParams = new URLSearchParams({
      "page[size]": "20",
      "filter[state]": "draft,pending,active,disabled,suspended,deleted"
    })
    let fetchedMembers = 0
    let memberResponse: any;
    do {
      membersParams.set("page[after]", "" + fetchedMembers)
      memberResponse = await this.get(`${membersUrl}?${membersParams.toString()}`)
      if (!memberResponse.data || !Array.isArray(memberResponse.data)) {
        throw new Error("Invalid response from social service")
      }
      for (const memberData of memberResponse.data) {
        const accountId = memberData.relationships.account?.data?.id
        const account = accounts.find(a => a.id === accountId)
        if (!account) {
          if (["pending", "draft"].includes(memberData.attributes.state)) {
            this.log(`Member ${memberData.attributes.code} is in state ${memberData.attributes.state}, skipping`)
          } else {
            this.warn(`Member ${memberData.attributes.code} account not found, skipping`, { member: memberData })
          }
          continue
        }
        
        account.member = {
          id: memberData.id,
          ...memberData.attributes
        }

        const userUrl = `${socialBase}/users?filter[members]=${memberData.id}`
        const userResponse = await this.get(userUrl)
        if (!userResponse.data || !Array.isArray(userResponse.data) || userResponse.data.length === 0) {
          this.warn(`No users found for member ${memberData.id}, skipping`, { member: memberData })
          continue
        }
        const users = userResponse.data.map((user: any) => ({id: user.id}))
        account.users = users
      }
      fetchedMembers += memberResponse.data.length
      await this.log(`Fetched ${fetchedMembers} members so far`)
    } while (memberResponse.links && memberResponse.links.next !== null);

    const accountsWithOneUser = accounts.filter(a => a.users && a.users.length === 1).length
    const accountsWithMoreThanOneUser = accounts.filter(a => a.users && a.users.length > 1).length
    const accountsWithoutUsers = accounts.filter(a => !a.users || a.users.length === 0).length

    await this.log(`Finished fetching accounts. ${accounts.length} accounts found, ${accountsWithOneUser} with one user, ${accountsWithMoreThanOneUser} with more than one user, ${accountsWithoutUsers} without users.`)
    
    // Save accounts in migration data
    this.migration.data.accounts = accounts
    await this.controller.updateMigrationData(this.migration.id, { accounts: this.migration.data.accounts })
  }

  private async getTransfers() {
    const url = this.accountingUrl() + `/${this.migration.code}/transfers`
    const params = new URLSearchParams({
      "page[size]": "20",
      "include": "payer,payee"
    })
    let response: any;
    const transfers: MigrationTransfer[] = []
    do {
      params.set("page[after]", "" + transfers.length)
      response = await this.get(`${url}?${params.toString()}`)
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error("Invalid response from accounting service")
      }
      for (const transferData of response.data) {
        const payerId = transferData.relationships.payer.data.id
        const payeeId = transferData.relationships.payee.data.id
        
        const payer = response.included.find((i: any) => i.type === 'accounts' && i.id === payerId)
        const payee = response.included.find((i: any) => i.type === 'accounts' && i.id === payeeId)

        transfers.push({
          id: transferData.id,
          ...transferData.attributes,
          payer: {
            id: payerId,
            code: payer.attributes.code,
          },
          payee: {
            id: payeeId,
            code: payee.attributes.code,
          },
          user: {
            id: transferData.relationships.user.data.id,
          }
        })
      }
      await this.log(`Fetched ${transfers.length} transfers so far`)
    } while (response.links && response.links.next !== null);

    await this.log(`Finished fetching transfers.`);

    // Save transfers in migration data
    this.migration.data.transfers = transfers
    await this.controller.updateMigrationData(this.migration.id, { transfers: this.migration.data.transfers })
  }

  private async createCurrency() {
    if (!this.migration.data.currency) {
      throw new Error("No currency data found in migration")
    }
    const currencyData = this.migration.data.currency;

    // Fix unsupported unlimited credit limit
    if (currencyData.settings.defaultInitialCreditLimit as unknown === false) {
      currencyData.settings.defaultInitialCreditLimit = (10 ** currencyData.scale) * UNLIMITED_CREDIT_LIMIT
    }
    
    // Set a default external credit limit and maximum balance as this concept does not exists in integralces.
    // Admins may need to change it later.
    const oneThousandHours = (10 ** currencyData.scale) * Math.round(1000 * currencyData.rate.d / currencyData.rate.n)
    currencyData.settings.externalTraderCreditLimit = oneThousandHours
    currencyData.settings.externalTraderMaximumBalance = oneThousandHours

    await this.controller.controller.createCurrency(systemContext(), currencyData)
    await this.log(`Currency ${currencyData.code} created successfully in the ledger`)
  }

  private async createAccounts() {
    const accounts = this.migration.data.accounts;

    if (!accounts) {
      throw new Error("No accounts data found in migration")
    }
    const currencyController = await this.controller.controller.getCurrencyController(this.migration.code) as LedgerCurrencyController;
    const currency = await currencyController.getCurrency(systemContext());
    
    const db = this.controller.controller.tenantDb(this.migration.code)  
    const accountController = currencyController.accounts;

    const isLedgerAccount = (account: MigrationAccount) => {
      const status = account.member?.state
      return status === AccountStatus.Active 
        || status === AccountStatus.Disabled
        || status === AccountStatus.Suspended
    }

    const isDeletedAccount = (account: MigrationAccount) => {
      const status = account.member?.state
      return status === AccountStatus.Deleted
    }

    // Ensure credit account has enough balance for creating all accounts.
    // THis should not be required but actually is needed for parallel account creation
    // and also saves us a few ledger ops.
    const totalCredit = accounts.reduce((sum, account) => {
      if (isLedgerAccount(account)) {
        const creditLimit = account.creditLimit === -1 ? currency.settings.defaultInitialCreditLimit : account.creditLimit;
        sum += creditLimit;
      }
      return sum;
    }, 0)

    const issuer = await currencyController.ledger.getAccount(currency.keys.issuer)
    const credit = await currencyController.ledger.getAccount(currency.keys.credit)
    const creditDiff = totalCredit - currencyController.amountFromLedger(credit.balance());
    if (creditDiff > 0) {
      await issuer.pay({
        amount: currencyController.amountToLedger(creditDiff),
        payeePublicKey: currency.keys.credit
      }, {
        account: await currencyController.keys.issuerKey(),
        sponsor: await currencyController.keys.sponsorKey()
      })
    }

    const createAccount = async (account: MigrationAccount) => {
      if (!account.member) {
        // Check if the account has any transfers.
        const hasTransfers = this.migration.data.transfers?.some(t => t.payer.id === account.id || t.payee.id === account.id)
        if (hasTransfers) {
          // Treating as deleted account.
          account.member = {
            id: "",
            state: AccountStatus.Deleted,
            type: "personal",
          }
          await this.log(`Account ${account.code} has transfers but no member data, treating as deleted`, { accountId: account.id });
        } else {
          await this.warn(`Skipping account ${account.code} without member data nor transfers`, { accountId: account.id });
          return;
        }
      }
      if (account.member.type === "virtual") {
        await this.log(`Skipping virtual account ${account.code}`)
        return;
      }
      
      // Check if account already exists.
      let existingAccount = await db.account.findUnique({
        where: { id: account.id },
        select: { id: true, code: true, status: true }
      })
      
      if (!existingAccount) {
        // Create account.
        const maximumBalance = (account.maximumBalance === -1 || !account.maximumBalance) ? undefined : account.maximumBalance;

        if (isLedgerAccount(account)) {
          // This is the case where the account really needs to be created in the ledger.
          const model = {
            id: account.id,
            code: account.code,
            creditLimit: account.creditLimit === -1 ? undefined : account.creditLimit,
            maximumBalance,
            users: account.users
          }
          await accountController.createAccount(systemContext(), model)
          // Override created & updated dates.
          await db.account.update({
            where: { id: account.id },
            data: {
              created: new Date(account.created),
              updated: new Date(account.updated)
            }
          })
          existingAccount = await accountController.getFullAccount(account.id, false)
          await this.log(`Account ${account.code} created in the ledger`)
        } else if (isDeletedAccount(account)) {
          // This is the case of a deleted account (or suspended with zero balance, in which case we migrate as deleted).
          
          // Create a random key for the deleted account
          const keyValue = Keypair.random()
          const keyId = await currencyController.keys.storeKey(keyValue)
          
          const record = await db.account.create({
            data: {
              tenantId: db.tenantId,
              id: account.id,
              code: account.code,
              balance: 0,
              creditLimit: account.creditLimit === -1 || account.creditLimit === undefined ? currency.settings.defaultInitialCreditLimit : account.creditLimit,
              maximumBalance,
              status: AccountStatus.Deleted,
              created: new Date(account.created),
              updated: new Date(account.updated),
              type: "user",
              users: {
                create: account.users?.map(user => ({
                  user: {
                    connectOrCreate: {
                      where: { 
                        tenantId_id: {
                          tenantId: db.tenantId,
                          id: user.id
                        } 
                      },
                      create: { id: user.id }
                    }
                  }
                }))
              },
              currency: {
                connect: { id: currency.id }
              },
              key: {
                connect: { id: keyId }
              },
              settings: account.settings
            }
          })
          existingAccount = recordToAccount(record, currency)
          await this.log(`Deleted account ${account.code} created in the DB`)
          
        } else {
          await this.warn(`Skipping account ${account.code} with state ${account.member.state}.`);
        }
      }

      // Now the account exists (or is skipped). Check if we need to update the settings and the state.
      if (existingAccount) {
        // Set account settings
        const status = account.member?.state as AccountStatus
        if (existingAccount.status === "active") {  
          await accountController.updateAccountSettings(systemContext(), {
            id: account.id,
            ...account.settings
          })
        }
        // Update account status if needed
        if (existingAccount.status === "active"  && (["disabled", "suspended"].includes(status))) {
          // Disable or suspend account
          await accountController.updateAccount(systemContext(), {
            id: account.id,
            status: status
          })
          await this.log(`Account ${account.code} status changed to ${status}`)
        }
      }
    }

    await promisePool(accounts, createAccount, 5)
    await this.log(`Finished creating ${accounts.length} accounts in the ledger`)
  }

  private async createTransfers() {
    const transfers = this.migration.data.transfers;
    if (!transfers) {
      throw new Error("No transfers data found in migration")
    }
    const db = this.controller.controller.tenantDb(this.migration.code)
    await this.log(`Creating ${transfers.length} transfers in the ledger...`)
    
    // We will log every 1, 10, 100 or 1000 transfers depending on the number of transfers.
    const logEvery = 10 ** Math.min(Math.max(Math.floor(Math.log10(transfers.length) - 1), 0), 3)
    let count = 0
    let existing = 0

    const getDBAccount = async (id: string) => {
      const account = await db.account.findUnique({
        where: { id },
        select: { id: true, code: true }
      })
      if (!account) {
        throw new Error(`Account with id ${id} not found in the database`)
      }
      return account
    }
    const isLocalAccount = (account: {id: string, code: string}) => {
      return account.code.match(`${this.migration.code}[0-9]{4}`) !== null;
    }

    const currencyController = await this.controller.controller.getCurrencyController(this.migration.code) as LedgerCurrencyController;
    const currency = await currencyController.getCurrency(systemContext());

    for (const transfer of transfers) {
      // Find payer and payee accounts to be sure they exist in our DB.
      // Check if transfer already exists in the DB.
      const existingTransfer = await db.transfer.findUnique({
        where: { tenantId_id: { tenantId: db.tenantId, id: transfer.id } },
        select: { id: true }
      })

      if (existingTransfer) {
        if (count++ % logEvery === 0) {
          await this.log(`Skipped ${count} existing transfers so far`)
        }
        continue;
      }

      // Use virtual account for external transfers.
      const isLocalPayer = isLocalAccount(transfer.payer)
      const isLocalPayee = isLocalAccount(transfer.payee)
      if (!isLocalPayer && !isLocalPayee) {
        await this.warn(`Skipping transfer ${transfer.id} with payer ${transfer.payer.code} and payee ${transfer.payee.code} not in local accounts`, { transfer });
        continue; // Skip transfers with both payer and payee not in local accounts
      }
      const localPayer = isLocalPayer ? await getDBAccount(transfer.payer.id) : currency.externalAccount;
      const localPayee = isLocalPayee ? await getDBAccount(transfer.payee.id) : currency.externalAccount;
      const isExternal = !isLocalPayer || !isLocalPayee;

      const meta = {
        ...transfer.meta,
        migration: {
          id: this.migration.id,
        },
      } as TransferMeta
      
      if (!TransferStates.includes(transfer.state)) {
        this.warn(`Transfer ${transfer.id} has unknown state ${transfer.state}, setting to failed`, { transfer });
        transfer.state = "failed" // Fallback to failed if state is unknown. 
      }

      // check if provided user exists, otherwise use the currency admin user
      let userId = transfer.user.id;
      const user = await db.user.findUnique({
        where: { tenantId_id: { tenantId: db.tenantId, id: userId } },
        select: { id: true }
      })
      if (!user) {
        // Use the first admin user of the currency as the user for the transfer
        userId = currency.admin.id
      }
      
      await db.transfer.create({
        data: {
          id: transfer.id,
          amount: transfer.amount,
          state: transfer.state,
          meta,
          created: new Date(transfer.created),
          updated: new Date(transfer.updated),
          authorization: undefined,
          payer: {
            connect: { id: localPayer.id }
          },
          payee: {
            connect: { id: localPayee.id }
          },
          user: {
            connect: {
              tenantId_id: {
                tenantId: db.tenantId,
                id: userId
              }
            }
          }
        }
      })

      if (isExternal) {
        const isRegularExternalTransfer = (transfer: MigrationTransfer) => {
          const isRegularExternalAccount = (account: {id: string, code: string}) => {
            return !account.code.startsWith(`${this.migration.code}`) && account.code.match(/^[A-Z0-9]{4}[0-9]{4}$/) !== null;
          }
          return isLocalPayee && isRegularExternalAccount(transfer.payer) ||
                 isLocalPayer && isRegularExternalAccount(transfer.payee) 
        }
        const getExternalAccount = async ({id, code}: {id: string, code: string}) => {
          const currencyCode = code.substring(0, 4);
          return await currencyController.externalResources.getExternalResource(systemContext(), {
            type: "accounts",
            id: id,
            meta: {
              external: true,
              href: this.accountingUrl() + `/${currencyCode}/accounts/${id}`
            }
          })
        }
        try {
          if (isRegularExternalTransfer(transfer)) {
            // We can migrate this transfer as an external transfer.
            const externalPayer = isLocalPayer ? undefined : await getExternalAccount(transfer.payer)
            const externalPayee = isLocalPayee ? undefined : await getExternalAccount(transfer.payee)

            await db.externalTransfer.create({
              data: {
                id: transfer.id,
                externalPayerId: externalPayer?.id,
                externalPayeeId: externalPayee?.id
              }
            })
          } else if (meta.cenip) {
            // This is a CENIP external transfer. The meta already contains the remote but we migrate it
            // just as a local transfer with the external account.
            await this.log(`Found CENIP external transfer ${transfer.id} with payer ${transfer.payer.code} and payee ${transfer.payee.code}`);
          } else {
            // This is an unexpected external transfer, we'll migrate it as a local transfer with external account.
            await this.warn(`Unexpected external transfer ${transfer.id} with payer ${transfer.payer.code} and payee ${transfer.payee.code}, migrating as local transfer`, { transfer });
          }
        } catch (error) {
          await db.transfer.delete({ where: { tenantId_id: { tenantId: db.tenantId, id: transfer.id }}})
          throw error
        }
      }

      if (count++ % logEvery === 0) {
        await this.log(`Created ${count} transfers so far`)
      }
    }
    await this.log(`Finished creating transfers with ${count} transfers in total`)
    if (existing > 0) {
      await this.warn(`Skipped a total of ${existing} existing transfers`)
    }
  }

  private async computeAccountBalance(db: TenantPrismaClient, account: {id: string}) {
    const transfers = await db.transfer.findMany({
      where: {
        OR: [
          { payerId: account.id },
          { payeeId: account.id }
        ],
        state: "committed"
      }
    })
    const balance = transfers.reduce((acc, transfer) => {
      if (transfer.payerId === account.id) {
        acc -= transfer.amount;
      }
      if (transfer.payeeId === account.id) {
        acc += transfer.amount;
      }
      return acc;
    }, 0n);
    return balance
  }

  private async setBalances() {
    const db = this.controller.controller.tenantDb(this.migration.code)
    const currencyController = await this.controller.controller.getCurrencyController(this.migration.code) as LedgerCurrencyController;
    const currency = await currencyController.getCurrency(systemContext());
    const ledger = currencyController.ledger;

    const accountIds = await db.account.findMany({
      where: {
        tenantId: db.tenantId,
        status: { in: ["active", "suspended", "disabled"] }
      },
      select: {
        id: true,
      }
    })
    const dbAccounts = await Promise.all(accountIds.map(
      aId => currencyController.accounts.getFullAccount(aId.id, false)
    ))

    const migrationAccount = (id: string) => this.migration.data.accounts?.find(a => a.id === id)

    // order accounts by (expected) balance, ascending so the credit account 
    // doesnt get out of balance.
    const accounts = dbAccounts.filter(
      (account) => {
        if (migrationAccount(account.id) === undefined) {
          this.warn(`Account ${account.code} not found in migration data, skipping balance setting`);
          return false; // Skip accounts not in migration data
        }
        return true; // Keep accounts that are in migration data
      }
    )
    
    accounts.sort((a, b) => {
      const migrationAccountA = migrationAccount(a.id)!;
      const migrationAccountB = migrationAccount(b.id)!;
      return migrationAccountA.balance - migrationAccountB.balance;
    })

    // This is a virtual account so taht all transfers get factored through this account.
    const getMigrAccount = async () => {
      let migrAccount = await currencyController.accounts.getAccountByCode(systemContext(), `${this.migration.code}MIGR`);
      if (!migrAccount) {
        migrAccount = await currencyController.accounts.createAccount(systemContext(), {
          code: `${this.migration.code}MIGR`
        }) as FullAccount;
      }
      return migrAccount
    }
    const migrAccount = await getMigrAccount();

    this.controller.updateMigrationData(this.migration.id, {
      migrationAccount: {
        id: migrAccount.id,
        code: migrAccount.code,
        key: migrAccount.key,
      }
    })
    
    await this.log(`Setting balances for ${accounts.length} accounts...`)
    
    const logs = (await db.migration.findUnique({
      select: { log: true },
      where: { id: this.migration.id }
    }))?.log as MigrationLogEntry[] | undefined

    if (!logs) {
      throw new Error("Migration not found")
    }

    let skipped = 0
    const setAccountBalance = async (account: FullAccount, keys: {account: Keypair, sponsor: Keypair}) => {
      let balance = await this.computeAccountBalance(db, account);

      // Check the computed balance agains the balance in the account migration.
      const mAccount = migrationAccount(account.id);
      if (mAccount !== undefined && (balance !== BigInt(mAccount.balance))) {
        await this.warn(`Balance mismatch for account ${account.code}: computed ${balance}, expected ${mAccount.balance}`);
      }
      // It is possible in exceptional cases that the account does not have sufficient credit
      // In this case we increase the account credit limit just to satisfy its balance.
      if (balance < 0 && balance < -account.creditLimit) {
        this.warn(`Account ${account.code} has negative balance ${balance} but credit limit ${account.creditLimit} is insufficient, increasing credit limit`);
        account.creditLimit = Number(-balance);
        await currencyController.accounts.updateAccount(systemContext(), {
          id: account.id,
          creditLimit: account.creditLimit
        })
      }
      let accountKey
      let difference
      if (account.status === "active") {
        accountKey = account.key;
        // The ledgerBalance should be = creditLimit, but we recompute it just in case and for idempotency.
        const ledgerAccount = await ledger.getAccount(account.key);
        if (!ledgerAccount) {
          throw new Error(`Ledger account for ${account.code} not found`);
        }
        const ledgerBalance = currencyController.amountFromLedger(ledgerAccount.balance());
        difference = balance + BigInt(account.creditLimit) - BigInt(ledgerBalance);

      } else if (account.status === "suspended" || account.status === "disabled") {
        // In this case we should move the balance to the pool account. In this case we can't
        // use the ledger balance for idempotency so we check the logs instead.
        const alreadySet = logs.some(log => log.step === "set-balances" && log.message.startsWith(`Account ${account.code} balance set to`))
        if (alreadySet) {
          skipped++
          return;
        } else {
          if (!currency.keys.disabledAccountsPool) {
            throw new Error("Disabled accounts pool account not configured in currency")
          }
          // Use the pool account instead of the account.
          accountKey = currency.keys.disabledAccountsPool;
          difference = balance
        }
      } else {
        throw new Error(`Cannot set balance for account ${account.code} with status ${account.status}`);
      }
      
      if (difference === 0n) {
        skipped++
        return;
      } else {
        const positive = difference > 0n;
        const payerKey = positive ? migrAccount.key : accountKey
        const payeeKey = positive ? accountKey : migrAccount.key;
        
        const ledgerPayer = await ledger.getAccount(payerKey);
        const ledgerAmount = currencyController.amountToLedger((positive ? 1 : -1) * Number(difference));

        const transfer = await ledgerPayer.pay({
          amount: ledgerAmount.toString(),
          payeePublicKey: payeeKey,
        }, keys)
        await this.log(`Transfer of ${difference} created for account ${account.code} with balance ${balance}`, {
          hash: transfer.hash,
          account: account.code,
          balance: balance.toString(),
        });
      }

      // Double check the balance after the transfer
      if (account.status === "active") {
        const ledgerAccount = await ledger.getAccount(account.key);
        const newBalance = BigInt(currencyController.amountFromLedger(ledgerAccount.balance())) - BigInt(account.creditLimit);
        
        if (newBalance !== balance) {
          await this.warn(`Balance for account ${account.code} after transfer is ${newBalance}, expected ${balance}`);
          balance = newBalance
        }
      }

      // Finally update the account balance in the DB
      await db.account.update({
        where: { id: account.id },
        data: {
          balance: balance,
          updated: new Date()
        }
      })
      
      account.balance = Number(balance); 
      await this.log(`Account ${account.code} balance set to ${balance} (${account.status}).`);
      
    }
    const externalBalance = await this.computeAccountBalance(db, currency.externalAccount)
    const setExternalBalance = async () => {
      if (externalBalance < 0) {
        const stellar = currencyController.ledger as StellarCurrency
        const remaining = currencyController.amountToLedger(
          (currency.settings.externalTraderCreditLimit ?? 0) + Number(externalBalance)
        )

        await stellar.updateExternalOffer(stellar.asset(), {
          sponsor: await currencyController.keys.sponsorKey(),
          externalTrader: await currencyController.keys.externalTraderKey()
        }, remaining)
      }

      await setAccountBalance(currency.externalAccount, {
        account: await currencyController.keys.externalTraderKey(),
        sponsor: await currencyController.keys.sponsorKey()
      })
      await this.log(`External account balance set successfully to ${externalBalance}`);
    }

    if (externalBalance < 0) {
      await setExternalBalance()
    }
    
    await promisePool(accounts, async (account) => setAccountBalance(account, {
        account: await currencyController.keys.adminKey(),
        sponsor: await currencyController.keys.sponsorKey()
    }), 5)

    if (externalBalance > 0) {
      await setExternalBalance()
    }
    
    await this.log(`Finished setting balances for ${accounts.length} accounts`)
    await this.log(`Skipped ${skipped} accounts already ahving the right balance`)
    
    await currencyController.accounts.updateAccountBalance(migrAccount)

    // Check if the migration account has zero balance and delete it if so.
    
    if (migrAccount.balance === 0) {
      this.log(`Migration account ${migrAccount.code} has zero balance, deleting it`)
      await currencyController.accounts.deleteAccount(systemContext(), migrAccount.id)
      await this.log(`Migration account ${migrAccount.code} deleted successfully`)
    } else {
      await this.warn(`Migration account ${migrAccount.code} has non-zero balance ${migrAccount.balance} after migration, please check it manually`)
    }
  }
  private async disableInactiveAccounts() {
    const accounts = this.migration.data.accounts
    const transfers = this.migration.data.transfers
    if (!accounts || !transfers) {
      throw new Error("No accounts or transfers data found in migration")
    }
    let disabled = 0
    for (const account of accounts) {
      if (account.member?.state === AccountStatus.Active) {
        const created = new Date(account.created)
        const lastestActivityDate = transfers.filter(t => t.payer.id === account.id || t.payee.id === account.id)
          .reduce((latest, t) => {
            const tDate = new Date(t.updated)
            return tDate > latest ? tDate : latest
          }, created)
        const twentyTwenty = new Date("2020-01-01T00:00:00Z")
        if (lastestActivityDate < twentyTwenty) {
          // Set account state to disabled.
          account.member.state = AccountStatus.Disabled
          disabled++
        }
      }
    }
    this.controller.updateMigrationData(this.migration.id, { accounts })
    await this.log(`Disabled ${disabled} inactive accounts (no activity since 2020)`)
  }
  private async setDisabledMembers() {
    // Call integralces instance to set the accounts with status = disabled to disabled members.
    const disabledAccounts = this.migration.data.accounts?.filter(a => a.member && a.member.state === AccountStatus.Disabled)
    if (!disabledAccounts || disabledAccounts.length === 0) {
      await this.log("No disabled accounts found, skipping setting disabled members")
      return;
    }
    this.log(`Setting ${disabledAccounts.length} disabled members in social service...`)
    const socialBase = this.socialUrl()
    let updated = 0
    for (const account of disabledAccounts) {
      if (!account.member) {
        continue;
      }
      const memberUrl = `${socialBase}/${this.migration.code}/members/${account.member.id}`
      try {
        await this.patch(memberUrl, { data: {
          id: account.member.id,
          type: "members",
          attributes: {
            state: "disabled" 
          }
        }})
        updated++
      } catch (error) {
        await this.warn(`Failed to set member ${account.code} to disabled`, { error })
      }
    }
    await this.log(`Finished setting disabled members, ${updated} members updated successfully`)

  }
}