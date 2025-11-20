import { Currency, Prisma } from "@prisma/client";
import { AbstractCurrencyController } from "../controller/abstract-currency-controller";
import { AccountSettings, CurrencySettings, userHasAccount } from "../model";
import { Context } from "../utils/context";
import { forbidden, notFound } from "../utils/error";
import { InputTopupSettings, recordToTopup, AccountTopupSettings, TopupSettings, type DepositCurrency, type InputTopup, type Topup } from "./model";
import { rate } from "../utils/rate";

export interface TopupService {
  /**
   * Create a topup for the given account, but does not process it yet.
   */
  createTopup(context: Context, data: InputTopup): Promise<Topup>;
  /**
   * Retrieve a topup by id.
   * @param ctx 
   * @param id Topup id
   */
  getTopup(ctx: Context, id: string): Promise<Topup>;
  /***
   * Get the topup settings for the currency.
   */
  getCurrencyTopupSettings(ctx: Context): Promise<TopupSettings>;
  /**
   * Update the topup settings for the currency.
   */
  updateCurrencyTopupSettings(ctx: Context, data: InputTopupSettings): Promise<TopupSettings>;
  /**
   * Get the topup settings for the account.
   * @param accountId Account id
   */
  getAccountTopupSettings(ctx: Context, accountId: string): Promise<AccountTopupSettings>;
  /**
   * Update the topup settings for the account.
   */
  updateAccountTopupSettings(ctx: Context, data: AccountTopupSettings): Promise<AccountTopupSettings>;
}

type CurrencySettingsWithTopup = CurrencySettings & {
  topup: TopupSettings | null | undefined;
}
type AccountSettingsWithTopup = AccountSettings & {
  topup: AccountTopupSettings | null | undefined;
}

export class TopupController extends AbstractCurrencyController implements TopupService {
  
  private defaultTopupSettings() : TopupSettings {
    const currency = this.currency()
    return {
      enabled: false,
      defaultAllowTopup: false,
      depositCurrency: "EUR",
      // Use the currency rate, use a HOR rate of 1:10 and apply the currency scale and the 2 scale for EUR.
      rate: rate(currency.rate.n * (10 ** currency.scale), currency.rate.d * 10 * 100),
      minAmount: 500,
      maxAmount: 30000,
      paymentProvider: "mollie"
    }
  }

  public async getCurrencyTopupSettings(ctx: Context): Promise<TopupSettings> {
    const currencySettings = await this.currencyController.getCurrencySettings<CurrencySettingsWithTopup>(ctx)
    
    const topupSettings = currencySettings.topup ?? {}
    const defaultSettings = this.defaultTopupSettings()

    const settings = {
      ...defaultSettings,
      ...topupSettings
    }
    
    return settings
  }

  public async updateCurrencyTopupSettings(ctx: Context, data: InputTopupSettings): Promise<TopupSettings> {
    // Validate user
    await this.users().checkAdmin(ctx)
    const topupSettings = await this.getCurrencyTopupSettings(ctx)
    const updatedSettings = {
      ...topupSettings,
      ...data
    }
    await this.currencyController.updateCurrencySettings<CurrencySettingsWithTopup>(ctx, {
      id: this.currency().settings.id,
      topup: {
        ...updatedSettings
      }
    })
    return this.getCurrencyTopupSettings(ctx)
  }

  public async getAccountTopupSettings(ctx: Context, accountId: string): Promise<AccountTopupSettings> {
    // Validate user
    const user = await this.users().checkUser(ctx)
    const account = await this.currencyController.accounts.getFullAccount(accountId)
    if (!userHasAccount(user, account) && !this.users().isAdmin(user)) {
      throw forbidden("Access denied")
    }
    const accountSettings = account.settings as AccountSettingsWithTopup
    const accountTopupSettings = {
      id: account.id,
      ...accountSettings.topup
    }
    return accountTopupSettings
  }

  public async updateAccountTopupSettings(ctx: Context, data: AccountTopupSettings): Promise<AccountTopupSettings> {
    // Validate user
    const user = await this.users().checkUser(ctx)
    const accountId = data.id
    const account = await this.currencyController.accounts.getFullAccount(accountId)
    if (!userHasAccount(user, account) && !this.users().isAdmin(user)) {
      throw forbidden("Access denied")
    }
    const accountSettings = account.settings as AccountSettingsWithTopup
    const updatedAccountSettings: AccountSettingsWithTopup = {
      ...accountSettings,
      topup: {
        ...accountSettings.topup,
        ...data
      }
    }
    await this.currencyController.accounts.updateAccountSettings(ctx, {
      ...updatedAccountSettings,
      id: account.id
    })
    return this.getAccountTopupSettings(ctx, accountId)
  }

  public async createTopup(context: Context, data: InputTopup): Promise<Topup> {
    // Validate user
    const user = await this.users().checkUser(context)
    // Validate feature enabled
    const topupSettings = await this.getCurrencyTopupSettings(context)
    if (!topupSettings?.enabled) {
      throw forbidden("Topups are not enabled for this currency")
    }
    // Check that the user has access to the account
    const accountId = data.account.id
    const account = await this.currencyController.accounts.getFullAccount(accountId)
    if (!userHasAccount(user, account)) {
      throw forbidden("Only account owners can topup their accounts")
    }
    const accountTopupSettings = await this.getAccountTopupSettings(context, accountId)

    const isAllowed = accountTopupSettings.allowTopup ?? (topupSettings.defaultAllowTopup ?? false)
    if (!isAllowed) {
      throw forbidden("Topups are not allowed for this account")
    }
    const { depositAmount, depositCurrency } = data
    if (depositCurrency !== topupSettings.depositCurrency) {
      throw forbidden(`Deposit currency must be ${topupSettings.depositCurrency}`)
    }
    if (depositAmount <= 0 || depositAmount < topupSettings.minAmount) {
      throw forbidden("Deposit amount is below minimum")
    }
    if (topupSettings.maxAmount !== false && depositAmount > topupSettings.maxAmount) {
      throw forbidden("Deposit amount is above maximum")
    }
    
    // Compute received amount.
    const receiveAmount = Math.floor(depositAmount * topupSettings.rate.n / topupSettings.rate.d)

    // Create topup record
    const record = await this.db().topup.create({
      data: {
        depositAmount,
        depositCurrency,
        receiveAmount,
        status: "new",
        paymentProvider: topupSettings.paymentProvider, 
        user: { 
          connect: {
            tenantId_id: {
              id: user.id,
              tenantId: this.db().tenantId
            }
          }
        },
        account: {
          connect: {
            id: account.id
          }
        },
        paymentData: Prisma.DbNull,
      }
    })

    return recordToTopup(record, account, null, user)

  }

  async getTopup(ctx: Context, id: string): Promise<Topup> {
    const user = await this.users().checkUser(ctx)
    const record = await this.db().topup.findUnique({
      where: { id },
    })
    if (record === null) {
      throw notFound("Topup not found")
    }
    const account = await this.accounts().getAccount(ctx, record.accountId)
    if (!userHasAccount(user, account)) {
      throw forbidden("Access denied")
    }
    const transfer = record.transferId ? await this.transfers().getTransfer(ctx, record.transferId) : null

    return recordToTopup(record, account, transfer, user)
  }
}