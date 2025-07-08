import { AccountType } from "@prisma/client";
import { AccountController as IAccountController } from "src/controller";
import { Account, AccountSettings, FullAccount, InputAccount, recordToAccount, Tag, UpdateAccount, User, userHasAccount } from "src/model";
import { CollectionOptions } from "src/server/request";
import { Context, systemContext } from "src/utils/context";
import { deriveKey, exportKey } from "src/utils/crypto";
import { badRequest, forbidden, notFound, notImplemented, unauthorized } from "src/utils/error";
import { WithRequired } from "src/utils/types";
import { AbstractCurrencyController } from "./abstract-currency-controller";
import { LedgerCurrencyController } from "./currency-controller";
import { whereFilter } from "./query";


export class AccountController extends AbstractCurrencyController implements IAccountController{
  constructor (readonly currencyController: LedgerCurrencyController) {
    super(currencyController)
  }

  public async createAccount(ctx: Context, account: InputAccount) {
    // Only the currency owner can create accounts (by now).
    const admin = await this.users().checkAdmin(ctx)
    // Account owner: provided in input or current user.
    const userIds = account.users?.map(u => u.id) ?? [admin.id]

    // Find next free account code.
    let code = account.code
    if (code) {
      await this.checkFreeCode(account.code)
    } else {
      code = await this.getFreeCode()
    }
    // get required keys from DB.
    const keys = {
      issuer: await this.keys().issuerKey(),
      credit: this.currency().settings.defaultInitialCreditLimit > 0 ? await this.keys().creditKey() : undefined,
      sponsor: await this.keys().sponsorKey()
    }
    // Create account in ledger with default credit limit & max balance.
    const maximumBalance = account.maximumBalance ?? this.currency().settings.defaultInitialMaximumBalance
    const creditLimit = account.creditLimit ?? this.currency().settings.defaultInitialCreditLimit
    const options = {
      initialCredit: this.currencyController.amountToLedger(creditLimit),
      maximumBalance: maximumBalance ? this.currencyController.amountToLedger(maximumBalance) : undefined
    }
    const {key} = await this.currencyController.ledger.createAccount(options, keys)
    // Store key
    const keyId = await this.keys().storeKey(key)
    // Store account in DB
    const record = await this.db().account.create({
      data: {
        id: account.id,
        code,
        // Initialize ledger values with what we have just created.
        creditLimit,
        maximumBalance,
        balance: 0,

        // Initialize some account settings (others will be taken from currency settings if not set)
        settings: {
          acceptPaymentsAutomatically: this.currency().settings.defaultAcceptPaymentsAutomatically,
          acceptPaymentsWhitelist: this.currency().settings.defaultAcceptPaymentsWhitelist,
        },

        currency: { connect: { id: this.currency().id } },
        key: { connect: { id: keyId } },
        users: {
          create: userIds.map(id => ({
            user: {
              connectOrCreate: {
                where: { 
                  tenantId_id: {
                    id,
                    tenantId: this.db().tenantId
                  }  
                },
                create: { id }
              }
            }
          }))
        }
      },
    })
    return recordToAccount(record, this.currency())
  }

  async updateAccount(ctx: Context, data: UpdateAccount): Promise<FullAccount> {
    // Only the currency owner can update accounts.
    await this.users().checkAdmin(ctx)

    const account = await this.getFullAccount(data.id)
    // code, creditLimit and maximumBalance can be updated
    if (data.code && data.code !== account.code) {
      await this.checkFreeCode(data.code)
    }
    // Update credit limit
    if (data.creditLimit && data.creditLimit !== account.creditLimit) {
      const ledgerAccount = await this.currencyController.ledger.getAccount(account.key)
      await ledgerAccount.updateCredit(this.currencyController.amountToLedger(data.creditLimit), {
        sponsor: await this.keys().sponsorKey(),
        credit: data.creditLimit > account.creditLimit ? await this.keys().creditKey() : undefined,
        issuer: data.creditLimit > account.creditLimit ? await this.keys().issuerKey() : undefined,
        account: data.creditLimit < account.creditLimit ? await this.keys().adminKey() : undefined
      })
    }
    // Update maximum balance
    if (data.maximumBalance && data.maximumBalance !== account.maximumBalance) {
      throw notImplemented("Updating maximum balance not implemented yet")
    }
    if (data.users) {
      throw notImplemented("Updating account users not implemented yet")
    }
    // Update db.
    const updated = await this.db().account.update({
      data: {
        code: data.code,
        creditLimit: data.creditLimit,
        maximumBalance: data.maximumBalance,
      },
      where: {id: account.id},
    })

    return recordToAccount(updated, this.currency())
  }

  filterAccount(user: User|undefined, account: FullAccount): Account {
    // Check if the balance should be hidden.
    const accountHideBalance = (account.settings.hideBalance ?? this.currency().settings.defaultHideBalance) ?? false
    if (!user || (accountHideBalance && !this.users().isAdmin(user) && !userHasAccount(user, account))) {
      // Hide balance for non-admin users.
      return {
        ...account,
        balance: undefined,
        creditLimit: undefined,
        maximumBalance: undefined, 
      }
    }
    return account
  }

  async getAccountBy(ctx: Context, field: "id"|"code"|"keyId", value: string): Promise<FullAccount | undefined> {
    const record = await this.db().account.findUnique({
      where: { 
        id: field === "id" ? value : undefined,
        code: field === "code" ? value : undefined,
        keyId: field === "keyId" ? value : undefined,
        status: "active",
      },
    })
    if (!record) {
      return undefined
    }
    return recordToAccount(record, this.currency())
  }

  async getAccount(ctx: Context, id: string): Promise<Account> {
    const account = await this.getFullAccount(id)
    // Filter account for the current user.
    const user = await this.users().getUser(ctx)
    return this.filterAccount(user, account)
  }

  /**
   * Returns a fully loaded account object for internal use.
   */
  async getFullAccount(id: string): Promise<WithRequired<FullAccount, "users">> {
    const record = await this.db().account.findUnique({
      where: { 
        id,
        status: "active",
      },
      include: { 
        users: { include: { user: true } },
        tags: true
      }
    })
    
    if (!record) {
      throw notFound(`Account id ${id} not found in currency ${this.currency().code}`)
    }
    return recordToAccount(record, this.currency()) as WithRequired<FullAccount, "users">;
  }

  /**
   * Implements {@link CurrencyController.getAccountByCode}
   */
  async getAccountByCode(ctx: Context, code: string): Promise<FullAccount|undefined> {
    // Anonymous users can access this endpoint.
    return this.getAccountBy(ctx, "code", code)
  }

  /**
   * Implements {@link CurrencyController.getAccountByKey}
   */
  async getAccountByKey(ctx: Context, key: string): Promise<FullAccount | undefined> {
    await this.users().checkUser(ctx)
    return this.getAccountBy(ctx, "keyId", key)
  }

  async getAccountByTag(ctx: Context, tag: string, hashed = false): Promise<FullAccount|undefined> {
    const hash = hashed ? tag : await this.accountTagHash(tag)
    const record = await this.db().accountTag.findFirst({
      where: { hash },
      include: { account: true }
    })
    if (!record || record.account.status !== "active") {
      return undefined
    }
    return recordToAccount(record.account, this.currency())
  }

  async getAccounts(ctx: Context, params: CollectionOptions): Promise<Account[]> {
    // Anonymous users can access this endpoint if they provide an single id, code or tag filter. 
    const isSingleCode = (typeof params.filters?.code === 'string')
    const isSingleTag = (typeof params.filters?.tag === 'string')
    const isSingleId = (typeof params.filters?.id === 'string')
    
    const allowAnonymous = isSingleCode || isSingleTag || isSingleId

    if (!allowAnonymous) {
      if (ctx.type === "anonymous") {
        throw unauthorized("No anonymous access allowed")
      } else {
        await this.users().checkUser(ctx)
      }
    }

    if (!isSingleTag && params.filters.tag) {
      throw badRequest("Only one tag filter allowed")
    }

    if (isSingleTag) {
      const account = await this.getAccountByTag(ctx, params.filters.tag as string) 
      return account ? [account] : []
    }
    
    const filter = whereFilter(params.filters)
    
    const records = await this.db().account.findMany({
      where: {
        currencyId: this.currency().id,
        status: "active",
        type: AccountType.user,
        ...filter,
      },
      include: {
        users: { include: { user: true } },
      },
      orderBy: {
        [params.sort.field]: params.sort.order
      },
      skip: params.pagination.cursor,
      take: params.pagination.size,
    })
    const user = await this.users().getUser(ctx)
    return records
      .map(r => recordToAccount(r, this.currency()))
      .map(account => this.filterAccount(user, account))
  }

  async deleteAccount(ctx: Context, id: string): Promise<void> {
    const user = await this.users().checkUser(ctx)
    const account = await this.getFullAccount(id)
    if (!(this.users().isAdmin(user) || userHasAccount(user, account))) {
      throw forbidden("User is not allowed to delete this account")
    }
    const ledgerAccount = await this.currencyController.ledger.getAccount(account.key)
    if (account.balance != 0) {
      throw badRequest("Account balance must be zero to delete account")
    }
    // Delete account in ledger
    await ledgerAccount.delete({
      sponsor: await this.keys().sponsorKey(),
      admin: await this.keys().adminKey()
    })
    // Soft delete account in DB
    await this.db().account.update({
      data: { status: "deleted" },
      where: { id }
    })
  }
  
  private async getFreeCode() {
    // We look for the maximum code of type "CODE1234", so we can have other codes ("CODESpecial").
    // Code numbers can have any length but are zero-padded until 4 digits.
    const pattern = `${this.currency().code}[0-9]+`
    const [{max}] = await this.db().$queryRaw`SELECT MAX(substring(code from 5)::int) as max FROM "Account" WHERE code ~ ${pattern}` as [{max: number|null}]
    const codeNum = (max !== null) ? max + 1 : 0
    const code = this.currency().code + String(codeNum).padStart(4, "0")
    return code
  }

  private async checkFreeCode(code: string) {
    if (!code.startsWith(this.currency().code)) {
      throw badRequest(`Code must start with ${this.currency().code}`)
    }
    const existing = await this.getAccountByCode(systemContext(), code)
    if (existing) {
      throw badRequest(`Code ${code} is already in use`)
    }
  }

  /**
   * Implements {@link CurrencyController.getAccountSettings}
   */
  public async getAccountSettings(ctx: Context, id: string): Promise<AccountSettings> {
    const user = await this.users().checkUser(ctx)
    const account = await this.getFullAccount(id)
    if (!this.users().isAdmin(user) && !userHasAccount(user, account)) {
      throw forbidden("User is not allowed to access this account settings")
    }
    return {
      id: account.id,
      ...account.settings
    }
  }

  public async updateAccountSettings(ctx: Context, settings: AccountSettings ): Promise<AccountSettings> {
    const user = await this.users().checkUser(ctx)
    const account = await this.getFullAccount(settings.id as string)
    if (!this.users().isAdmin(user) && !userHasAccount(user, account)) {
      throw forbidden("User is not allowed to update this account settings")
    }

    // Check that the user is only updating allowed settings.

    // We can make this list configurable in the future.
    const userSettings = [
      "acceptPaymentsAutomatically",
      "acceptPaymentsWhitelist", 
      "acceptExternalPaymentsAutomatically",
      "tags"
    ]

    const deleteUndefined = (obj: any) => {
      for (const key in obj) {
        if (obj[key] === undefined) {
          delete obj[key]
        }
      }
    }

    const {tags, id, ...updateSettings} = settings
    deleteUndefined(updateSettings)

    // User can update tags.
    if (tags) {
      await this.updateAccountTags(account, tags)
    }
    if (updateSettings && Object.keys(updateSettings).length) {
      // Since settings is a single Json value in table, we need to provide the full object.
      // And we need to remove the tags entry too, since they are saved in separate DB table.
      const {tags, ...oldSettings} = account.settings
      // Check permission to update each setting.
      if (!this.users().isAdmin(user)) {
        for (const key in updateSettings) {
          if (!userSettings.includes(key) && oldSettings[key as keyof typeof oldSettings] !== updateSettings[key as keyof typeof updateSettings]) {
            throw forbidden(`User is not allowed to update setting ${key}`)
          }
        }
      }

      const fullSettings = {
        ...oldSettings,
        ...updateSettings
      }

      // Delete the entries set to null.
      const deleteNull = (obj: any) => {
        for (const key in obj) {
          if (obj[key] === null) {
            delete obj[key]
          }
        }
      }
      deleteNull(fullSettings)
      
      await this.db().account.update({
        data: { settings: fullSettings },
        where: { id: account.id }
      })
    }

    return await this.getAccountSettings(ctx, settings.id as string)
    
  }

  async updateAccountTags(account: FullAccount, tags: Tag[]) {
    // Check all tags have name and either value or id (it is ok to update the name of a tag without changing the vaue)
    if (tags.some(t => !t.name || (!t.value && !t.id))) {
      throw badRequest("Tag name and value are required")
    // Check for repeated values or names
    } else if (tags.some(t => tags.filter(t2 => t2.name === t.name || t2.value === t.value).length > 1)) {
      throw badRequest("Repeated tag")
    }
    
    // Compute tag hashes
    const data = await Promise.all(tags.map(async t => ({
      id: t.value ? undefined : t.id,
      hash: t.value ? await this.accountTagHash(t.value as string) : undefined,
      name: t.name,
      accountId: account.id
    })))

    const newTags = data.filter(t => !t.id) // hash always defined here
    const updateTags = data.filter(t => t.id) // hash always undefined here 

    // Update tag records (delete + update + insert).
    await this.db().$transaction([
      // Delete ids not in the provided tags and also delete tags with
      // same values as the provided ones.
      this.db().accountTag.deleteMany({
        where: { 
          OR: [
            { id: { notIn: updateTags.map(t => t.id as string) }},
          ]
        }
      }),
      ...updateTags.map(t => this.db().accountTag.update({
        where: { id: t.id as string },
        data: { name: t.name }
      })),
      this.db().accountTag.createMany({
        data: newTags as {hash: string, name: string, accountId: string}[]
      })
    ])
  }

  async updateAccountBalance(account: FullAccount): Promise<void> {
    const ledgerAccount = await this.currencyController.ledger.getAccount(account.key)
    account.balance = this.currencyController.amountFromLedger(ledgerAccount.balance())
      - account.creditLimit
    await this.db().account.update({
      data: { balance: account.balance },
      where: { id: account.id }
    })
  }

  /**
   * We don't save the tag id in the DB, but a hash of the tag value.
   * Tags need to be searchable so we can't salt the hash with a unique string.
   */
  async accountTagHash(value: string) {
    const key = await deriveKey(value, "komunitin.org")
    return exportKey(key)
  }

}