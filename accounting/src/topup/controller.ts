import { Prisma } from "@prisma/client";
import { AbstractCurrencyController } from "../controller/abstract-currency-controller";
import { AccountSettings, CurrencySettings, userHasAccount } from "../model";
import { Context, systemContext } from "../utils/context";
import { badRequest, forbidden, internalError, notFound } from "../utils/error";
import { InputTopupSettings, recordToTopup, AccountTopupSettings, TopupSettings, type DepositCurrency, type InputTopup, type Topup, MolliePaymentData, UpdateTopup, TopupStatus } from "./model";
import { rate } from "../utils/rate";
import { nullToPrismaDBNull } from "../controller/multitenant";
import createMollieClient, { type Payment, type MollieClient } from '@mollie/api-client';
import { config } from "../config";
import { logger } from "../utils/logger";
import { Rate } from "../utils/types";

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
      id: currency.id,
      enabled: false,
      defaultAllowTopup: false,
      depositCurrency: "EUR",
      // Use the currency rate, use a HOR rate of 1:10 and apply the currency scale and the 2 scale for EUR.
      rate: rate(currency.rate.n * (10 ** currency.scale), currency.rate.d * 10 * 100),
      minAmount: 500,
      maxAmount: 30000,
      paymentProvider: "mollie",
      sourceAccountId: null
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
    // Some general validations
    if (updatedSettings.depositCurrency !== "EUR") {
      throw badRequest("Only EUR is supported as deposit currency")
    }
    if (updatedSettings.paymentProvider !== "mollie") {
      throw badRequest("Only mollie is supported as payment provider")
    }
    if (updatedSettings.minAmount <= 0) {
      throw badRequest("minAmount must be positive")
    }
    if (updatedSettings.maxAmount !== false && updatedSettings.maxAmount < updatedSettings.minAmount) {
      throw badRequest("maxAmount must be false or greater than minAmount")
    }
    if (updatedSettings.enabled && !topupSettings.enabled) {
      // require superadmin access to enable topups
      if (ctx.type !== "superadmin") {
        throw forbidden("Only superadmin users can enable topups")
      }
    }
    if (updatedSettings.enabled && !updatedSettings.sourceAccountId) {
      // Create a new source account.
      const sourceAccount = await this.accounts().createAccount(ctx, {
        code: this.currency().code + "TOPUP",
        type: "virtual"
      })
      updatedSettings.sourceAccountId = sourceAccount.id
    }
    if (updatedSettings.sourceAccountId) {
      // Validate that source account exists and is active
      await this.currencyController.accounts.getFullAccount(updatedSettings.sourceAccountId)
    }
    if (updatedSettings.mollieApiKey) {
      // Validate mollie api key by creating a client and testing a simple call
      try {
        const mollieClient = createMollieClient({ apiKey: updatedSettings.mollieApiKey });
        await mollieClient.methods.list()
      } catch (e) {
        throw badRequest("Invalid Mollie API Key")
      }
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

  private computeReceiveAmount(depositAmount: number, rate: Rate): number {
    return Math.floor(depositAmount * rate.n / rate.d)
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
    const receiveAmount = this.computeReceiveAmount(depositAmount, topupSettings.rate)
    const meta = data.meta?.description ? {
      description: data.meta?.description
    } : Prisma.DbNull

    if (data.receiveAmount && data.receiveAmount !== receiveAmount) {
      throw badRequest("receiveAmount does not match the computed amount")
    }

    if (data.status && data.status !== "new") {
      throw badRequest("status must be 'new' when creating a topup")
    }

    // Create topup record
    const record = await this.db().topup.create({
      data: {
        depositAmount,
        depositCurrency,
        receiveAmount,
        status: "new",
        meta,
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
    if (!userHasAccount(user, account) && !this.users().isAdmin(user)) {
      throw forbidden("Access denied")
    }
    const transfer = record.transferId ? await this.transfers().getTransfer(ctx, record.transferId) : null

    return recordToTopup(record, account, transfer, user)
  }

  async updateTopup(ctx: Context, data: UpdateTopup): Promise<Topup> {
    // We allow updatting topups even when the feature is disabled to
    // allow completing pending topups.
    
    const user = await this.users().checkUser(ctx)
    // Only topup owner can update the topup
    const topup = await this.getTopup(ctx, data.id)
    if (topup.user.id !== user.id) {
      throw forbidden("Only the topup owner can update it")
    }
    
    if (topup.status === "new" && data.status === "canceled") {
      // Allow canceling a new topup
      await this.updateStatus(topup.id, "canceled")
    }
    else if (topup.status === "new" && data.status === "pending") {
      try {
        // Validate enough credit in source account
        await this.checkViableTransfer(topup)
        // Create payment in mollie
        await this.createPayment(topup) 
      } catch (e) {
        // Either if validation or payment creation fails, we can
        // safely cancel the topup
        await this.updateStatus(topup.id, "canceled")
        throw e
      }
      // Update status to pending
      await this.updateStatus(topup.id, "pending")
    }
    else if (topup.status === "transfer_failed" && data.status === "transfer_completed") {
      // Allow retrying the transfer
      await this.makeTransferForTopup(topup)
    }
    return this.getTopup(ctx, topup.id)
  }

  private async checkViableTransfer(topup: Topup): Promise<void> {
    const settings = await this.getCurrencyTopupSettings(systemContext())
    if (!settings.sourceAccountId) {
      throw internalError("sourceAccountId is not set in topup settings")
    }
    // Check account exists (will handle credit limit later on).
    await this.currencyController.accounts.getFullAccount(settings.sourceAccountId)

    const userAccount = await this.currencyController.accounts.getFullAccount(topup.account.id)
    if (userAccount.maximumBalance && (userAccount.balance + topup.receiveAmount > userAccount.maximumBalance)) {
      throw forbidden("Topup would exceed account max balance")
    }
  }

  private mollieClient: MollieClient | null = null

  async getMollieClient(): Promise<MollieClient> {
    if (!this.mollieClient) {
      const settings = await this.getCurrencyTopupSettings(systemContext())
      const apiKey = settings.mollieApiKey
      if (!apiKey) {
        throw internalError("Mollie API Key setting is not set" );
      }
      this.mollieClient = createMollieClient({ apiKey });

    }
    return this.mollieClient
  }

  async createPayment(topup: Topup): Promise<void> {
    const mollieClient = await this.getMollieClient()
    const payment = await mollieClient.payments.create({
      amount: {
        value: (topup.depositAmount / 100).toFixed(2),
        currency: topup.depositCurrency
      },
      description: topup.meta?.description || `Topup #${topup.id}`,
      redirectUrl: `${config.APP_URL}/groups/${topup.account.currency.code}/topups/${topup.id}`,
      webhookUrl: `${config.WEBHOOKS_BASE_URL}/${topup.account.currency.code}/topups/${topup.id}/hooks/mollie`,  
    })

    await this.updatePaymentData(topup, payment)
  }

  

  async updatePaymentData(topup: Topup, payment: Payment): Promise<Topup> {
    const updateData: Partial<Topup> = {}
    
    if (topup.depositCurrency !== payment.amount.currency) {
      throw internalError(`Mollie webhook received for topup ${topup.id} with currency ${payment.amount.currency} different than expected ${topup.depositCurrency}.`);
    }
    
    const paymentAmount = payment.amount.value ? Math.round(parseFloat(payment.amount.value) * 100) : 0
    
    if (paymentAmount !== topup.depositAmount) {
      logger.error(`Mollie webhook received for topup ${topup.id} with amount ${paymentAmount} different than expected ${topup.depositAmount}. Updating to the new amount.`);
      updateData.depositAmount = paymentAmount
      const settings = await this.getCurrencyTopupSettings(systemContext())
      updateData.receiveAmount = this.computeReceiveAmount(paymentAmount, settings.rate)
    }
    
    const paymentData = {
      ...topup.paymentData,
      paymentId: payment.id,
      status: payment.status
    }
    
    if (payment.status === "open") {
      const checkoutUrl = payment.getCheckoutUrl()
      if (!checkoutUrl) {
        throw internalError("Failed to get checkout URL from Mollie");
      }
      paymentData.checkoutUrl = checkoutUrl
    }

    updateData.paymentData = paymentData as MolliePaymentData

    if (topup.status === "pending") {
      if (payment.status === "paid") {
        updateData.status = "payment_completed"
      } else if (payment.status === "canceled" || payment.status === "expired" || payment.status === "failed") {
        updateData.status = "payment_failed"
      }
    }

    const record = await this.db().topup.update({
      where: { id: topup.id },
      data: nullToPrismaDBNull(updateData)
    })

    return recordToTopup(record, topup.account, topup.transfer, topup.user)
  }

  async handleMollieWebhook(topupId: string, data: {id: string}): Promise<{ status: string }> {
    let topup
    try {
       topup = await this.getTopup(systemContext(), topupId)
    } catch (e) {
      // This topup does not exist, we return 200 anyway to avoid Mollie retrying
      logger.error(`Mollie webhook received for non-existing topup ${topupId}`);
      return { status: "topup_not_found" }
    }

    // Double check that payment id matches
    if (topup.paymentData?.paymentId !== data.id) {

      logger.error(`Mollie webhook received for topup ${topupId} with mismatching payment id ${data.id}`);
      return { status: "payment_not_found" }
    }
     
    const mollieClient = await this.getMollieClient()
    // If that throws for any reason, we let it propagate to return a 500 to Mollie so it retries.
    const payment = await mollieClient.payments.get(data.id)

    const updatedTopup = await this.updatePaymentData(topup, payment)

    if (topup.status === "pending" && payment.status === "paid") {
      // Make the transfer      
      this.unhandledMakeTransferForTopup(updatedTopup)
    }

    return { status: "ok" }
  }

  /**
   * Makes the transfer for the topup, without awaiting it nor throwing errors.
   * @param topupId 
   */
  private unhandledMakeTransferForTopup(topup: Topup) {
    this.makeTransferForTopup(topup).catch((error) => {
      logger.error(error)
    })
  }

  private async ensureTopupCredit(topup: Topup) {
    const settings = await this.getCurrencyTopupSettings(systemContext())
    if (!settings.sourceAccountId) {
      throw internalError("sourceAccountId is not set in topup settings")
    }
    const sourceAccount = await this.currencyController.accounts.getFullAccount(settings.sourceAccountId)
    if (sourceAccount.creditLimit + sourceAccount.balance < topup.receiveAmount) {
      const increase = settings.maxAmount 
        ? 100 * settings.maxAmount 
        : Math.max(topup.receiveAmount, (10 ** this.currency().scale) * 1000)
      
      // credit the source account
      await this.accounts().updateAccount(systemContext(), {
        id: sourceAccount.id,
        creditLimit: sourceAccount.creditLimit + increase
      })
    }
    return sourceAccount
  }

  private async makeTransferForTopup(topup: Topup) {
    try {
      const admin = this.currency().admin
      const sourceAccount = await this.ensureTopupCredit(topup)

      if (topup.transfer && (topup.transfer.state === "failed" || topup.transfer.state === "rejected")) {
        // delete transfer
        await this.transfers().deleteTransfer(systemContext(), topup.transfer.id)
        topup.transfer = null
      }
      if (!topup.transfer) {
        topup.transfer = await this.transfers().createTransfer(systemContext(), {
          amount: topup.receiveAmount,
          state: "new",
          meta: {
            description: topup.meta?.description || `Topup #${topup.id}`
          },
          payer: {
            type: "accounts",
            id: sourceAccount.id
          },
          payee: {
            type: "accounts",
            id: topup.account.id
          },
          user: {
            id: admin.id
          },
        })
      }
      // Update topup with transfer id
      await this.db().topup.update({
        where: { id: topup.id },
        data: { transferId: topup.transfer.id }
      })

      if (topup.transfer.state === "committed") {
        // Transfer already committed
        return
      } else if (topup.transfer.state === "new") {
        // Process the transfer
        topup.transfer = await this.transfers().updateTransfer(systemContext(), {
          id: topup.transfer.id,
          state: "committed"
        })
      }

      // Update topup status
      if (topup.transfer.state === "committed") {
        await this.updateStatus(topup.id, "transfer_completed")
      } else if (topup.transfer.state === "failed") {
        await this.updateStatus(topup.id, "transfer_failed")
      } else {
        throw internalError(`Unexpected transfer state ${topup.transfer.state} after committing transfer for topup ${topup.id}`)
      }
    } catch (e) {
      // If anything fails, we set the topup to transfer_failed so it can be retried
      await this.updateStatus(topup.id, "transfer_failed")
      throw e
    }
  }

  private async updateStatus(id: string, status: TopupStatus): Promise<void> {
    await this.db().topup.update({
      where: { id },
      data: { status }
    })
  }
}