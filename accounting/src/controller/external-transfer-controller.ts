import { FullAccount, Currency, InputTransfer, FullTransfer, TransferState, UpdateTransfer, User, userHasAccount, Account } from "src/model";
import { AbstractCurrencyController } from "./abstract-currency-controller";
import { isExternalResourceIdentifier } from "./external-resource-controller";
import { Context } from "src/utils/context";
import { badRequest, forbidden, internalError, noTrustPath } from "src/utils/error";
import { ExternalResource, ExternalResourceIdentifier } from "src/model/resource";
import { WithRequired } from "src/utils/types";
import { amountToLedger, convertAmount } from "./currency-controller";
import { TransferSerializer } from "src/server/serialize";
import { createExternalToken } from "./external-jwt";
import { config } from "src/config";
import { mount } from "src/server/parse";

type ExternalPayeeTransfer = WithRequired<FullTransfer, "externalPayee">
type ExternalPayerTransfer = WithRequired<FullTransfer, "externalPayer">

/**
 * This class implements the external transfers. There are requests to be handled:
 * 
 * 1. Create transfers (/POST transfers)
 * 
 * 1.1 Local payer, external payee (this can be submitted by this server)
 * 1.1.1 Local user pays
 * 1.1.2 External service requests payment
 * 
 * 1.2 External payer, local payee (this can't be submitted by this server)
 * 1.2.1 Local user requests payment
 * 1.2.2 External service notifies payment
 * 
 * 2. Update transfers (/PATCH transfers/:id)
 * 
 * 2.1 Local payer, external payee (this can be submitted by this server)
 * 2.1.1 Local user accepts/rejects payment request
 * 
 * 2.2 External payer, local payee (this can't be submitted by this server)
 * 2.2.1 External service notifies payment request acceptance/rejection
 * 
 * There are two main flows:
 * 
 * 1 External Payment
 * 
 * The user creates a payment transfer (1.1.1). The service submits the transaction 
 * and notifies the external service, which receives a notification request (1.2.2).
 * 
 * 
 */
export class ExternalTransferController extends AbstractCurrencyController {
  /**
   * Helper to check whether the input transfer is external.
   */
  public isExternalInputTransfer(data: InputTransfer) {
    const isExternalPayer = isExternalResourceIdentifier(data.payer) 
    const isExternalPayee = isExternalResourceIdentifier(data.payee)

    return isExternalPayer || isExternalPayee
  }
  /**
   * Helper to check whether a loaded transfer is external.
   */
  public isExternalTransfer(transfer: FullTransfer) {
    return transfer.externalPayee || transfer.externalPayer
  }

  /**
   * This is the main function to create an external transfer. 
   */
  public async createExternalTransfer(ctx: Context, data: InputTransfer): Promise<FullTransfer> {
    const isExternalPayer = isExternalResourceIdentifier(data.payer) 
    const isExternalPayee = isExternalResourceIdentifier(data.payee)

    if (isExternalPayer && isExternalPayee) {
      throw badRequest("Both payer and payee cannot be external")
    }

    if (isExternalPayee) {
      return await this.createTransferExternalPayee(ctx, data)
    } else if (isExternalPayer) {
      return await this.createTransferExternalPayer(ctx, data)
    }

    throw badRequest("Either payer or payee must be external")

  }

  /**
   * Payment to external account. 
   */
  private async createTransferExternalPayee(ctx: Context, data: InputTransfer): Promise<FullTransfer> {
    if (ctx.type === "external") {
      return await this.createTransferExternalPayeeExternalUser(ctx, data)
    } else {
      return await this.createTransferExternalPayeeLocalUser(ctx, data)
    }
  }

  /**
   * Handle the case of a transfer with external payee and local payer initiated by an external service. 
   */
  private async createTransferExternalPayeeExternalUser(ctx: Context, data: InputTransfer): Promise<FullTransfer> {
    if (!this.currency().settings.enableExternalPaymentRequests) {
      throw forbidden(`External payment requests are disabled.`)
    }
    // Check that the transfer is in committed state.
    if (data.state !== "committed") {
      throw badRequest(`The transfer state must be "committed"`)
    }
    // Check that the local payer account exists and has the sufficient rights.
    const payer = await this.accounts().getFullAccount(data.payer.id)
    if (!(payer.settings.allowExternalPaymentRequests || this.currency().settings.defaultAllowExternalPaymentRequests)) {
      throw forbidden("Account is not allowed to receive external payment requests")
    }
    // Check that the logged in external user matches the external payee account in the provided transfer.
    const externalPayee = await this.getExternalAccount(ctx, data.payee as ExternalResourceIdentifier)
    if (externalPayee.resource.key !== ctx.accountKey) {
      throw forbidden(`The logged in external user key ${ctx.accountKey} does not match the payee key ${externalPayee.resource.key}`)
    }
    // Create the transfer record with state = "new".
    const transfer = await this.transfers().createTransferRecord(data, payer, this.currency().externalAccount, this.currency().admin)
    transfer.externalPayee = externalPayee
    
    await this.db().externalTransfer.create({ 
      data: {
        id: transfer.id,
        externalPayeeId: transfer.externalPayee.id
      }
    })

    // Submit the transfer.
    await this.updateTransferStateExternalPayee(ctx, transfer as ExternalPayeeTransfer, data.state, this.currency().admin, false)

    // Return the response.
    return transfer

  }  
  
  /**
   * Handle the case of a transfer with local payer and external payee initiated by a local user.
   */
  private async createTransferExternalPayeeLocalUser(ctx: Context, data: InputTransfer): Promise<FullTransfer> {
    if (!this.currency().settings.enableExternalPayments) {
      throw forbidden(`External payments are disabled.`)
    }
    const user = await this.users().checkUser(ctx)

    // Check that the user is either the admin or the payer.
    const payer = await this.accounts().getFullAccount(data.payer.id)
    if (!this.users().isAdmin(user) 
      && !userHasAccount(user, payer)) {
      throw forbidden("User is not allowed to transfer from this account")
    }

    if (!(payer.settings.allowExternalPayments || this.currency().settings.defaultAllowExternalPayments)) {
      throw forbidden("Account is not allowed to make external payments")
    }

    // Create local transfer record with "new" state.
    const transfer = await this.transfers().createTransferRecord(data, payer, this.currency().externalAccount, user)

    // Create external transfer record
    transfer.externalPayee = await this.getExternalAccount(ctx, data.payee as ExternalResourceIdentifier)

    await this.db().externalTransfer.create({ 
      data: {
        id: transfer.id,
        externalPayeeId: transfer.externalPayee.id
      }
    })

    await this.updateTransferStateExternalPayee(ctx, transfer as ExternalPayeeTransfer, data.state, user, false)

    return transfer
  }

  /**
   * Payment from external account.
   */
  private async createTransferExternalPayer(ctx: Context, data: InputTransfer): Promise<FullTransfer> {
    // The payer is external and the payee is local, so it is the remote server that 
    // needs to submit the transfer to the ledger.There are 2 cases:

    if (ctx.type === "external") {
      // 1 - The submitter is an external service and the transaction has already been submitted to the 
      // ledger. This is supported.
      return await this.createTransferExternalPayerExternalUser(ctx, data)
    } else {
      // 2 - The submitter is a user from our local currency trying to create a payment request from an
      // external account. 
      return await this.createTransferExternalPayerLocalUser(ctx, data)
    }
  }

 /**
   * Handle the case of a transfer with external payer and local payee and initiated by an external service.
   * 
   * Since the other service is the payer's, this case just acknowledges a submitted transfer.
   */
  private async createTransferExternalPayerExternalUser(ctx: Context, data: InputTransfer): Promise<FullTransfer> {
    // Case 1.
    if (data.state !== "committed") {
      throw badRequest(`Only "committed" transfers can be created externally by the external payer.`)
    }

    if (!data.hash) {
      throw badRequest(`The hash of the transfer must be provided.`)
    }
      
    // Retrieve the transfer data from the ledger.
    const ledgerTransfer = await this.currencyController.ledger.getTransfer(data.hash)
    if (ledgerTransfer.payer !== ctx.accountKey) {
      throw forbidden(`The logged in external payer is not the payer of the transfer`)
    }

    // Check that the given local payee exists and matches the transfer key.
    const payee = await this.accounts().getFullAccount(data.payee.id)
    if (ledgerTransfer.payee !== payee.key) {
      throw badRequest(`The given payee ${data.payee.id} does not match the transfer key ${ledgerTransfer.payee}`)
    }

    // Check the external payer
    const externalPayer = await this.externalResources().getExternalResource<FullAccount>(ctx, data.payer as ExternalResourceIdentifier)
    if (ledgerTransfer.payer !== externalPayer.resource.key) {
      throw badRequest(`The given payer ${data.payer.id} does not match the transfer key ${ledgerTransfer.payer}`)
    }

    // Compute the amount from the ledger data.
    data.amount = this.currencyController.amountFromLedger(ledgerTransfer.amount)

    // All checks ok, so create the transfer record (in "new" state).
    const transfer = await this.transfers().createTransferRecord(data, this.currency().externalAccount, payee, this.currency().admin)
    transfer.externalPayer = externalPayer
    // and the external transfer record.
    await this.db().externalTransfer.create({
      data: {
        id: transfer.id,
        externalPayerId: externalPayer.id,
      }
    })
    // Update account balances
    await this.transfers().updateAccountBalances(transfer)
    
    // Set the transfer to committed state.
    await this.transfers().saveTransferState(transfer, "committed")
    return transfer  
  }  

  /**
   * Handle the case of a transfer with external payer and local payee and initiated by a local user.
   * 
   * Since the other is the payer's, this case just notifies the payer service.
   */
  private async createTransferExternalPayerLocalUser(ctx: Context, data: InputTransfer): Promise<FullTransfer> {
    // Check that the local currency supports external payment requests.
    if (!this.currency().settings.enableExternalPaymentRequests) {
      throw forbidden(`External payment requests are disabled.`)
    }

    // Check the caller is a local user.
    const user = await this.users().checkUser(ctx)

    // Check that the user is either the admin or the payee.
    const payee = await this.accounts().getFullAccount(data.payee.id)
    if (!this.users().isAdmin(user) 
      && !userHasAccount(user, payee)) {
      throw forbidden("User is not allowed to transfer from this account")
    }

    // Check that the account is allowed to make external payment requests
    if (!(payee.settings.allowExternalPaymentRequests || this.currency().settings.defaultAllowExternalPaymentRequests)) {
      throw forbidden("Account is not allowed to make external payment requests")
    }

    // Create local transfer record with "new" state.
    const transfer = await this.transfers().createTransferRecord(data, this.currency().externalAccount, payee, user)

    // Create external transfer record
    transfer.externalPayer = await this.getExternalAccount(ctx, data.payer as ExternalResourceIdentifier)

    const externalTransferRecord = await this.db().externalTransfer.create({ 
      data: {
        id: transfer.id,
        externalPayerId: transfer.externalPayer.id
      }
    })

    // We can't submit the transfer to the ledger since it needs to be signed by the 
    // payer account. All we can do is to ask the payer service.
    const result = await this.notifyTransferExternalPayer(ctx, transfer as ExternalPayerTransfer)
    
    // Update hash just in case the transfer has been actually submitted to the ledger.
    transfer.hash = result.hash

    // Update account balances if the transfer was already committed.
    if (result.state == "committed") {
      await this.transfers().updateAccountBalances(transfer)
    }

    // And update the transaction (state and hash).
    await this.transfers().saveTransferState(transfer, result.state)

    return transfer
  }


  /**
   * This is the main function to update an external transfer.
   * 
   * This function is called when accepting/rejecting an external payment request.
   */
  public async updateExternalTransfer(ctx: Context, data: UpdateTransfer, transfer: FullTransfer): Promise<FullTransfer> {
    // There are two use cases for this function:
    if (transfer.state !== "pending") {
      throw badRequest("Only pending external transfers can be updated")
    }
    if (transfer.externalPayer && ctx.type == "external") {
      // 1 - The external service notifies us about the acceptance/rejection of a previously requested payment.
      return await this.updateTransferExternalPayerExternalUser(ctx, data, transfer as ExternalPayerTransfer)
    } else if (transfer.externalPayee && ctx.type !== "external") {
      // 2 - The payer accepts/rejects the external payment request.
      return await this.updateTransferExternalPayeeLocalUser(ctx, data, transfer as ExternalPayeeTransfer)
    } else {
      throw badRequest("Invalid external transfer update")
    }
  }
  /**
   * Update transfer as notified by external payer. 
   */
  private async updateTransferExternalPayerExternalUser(ctx: Context, data: UpdateTransfer, transfer: ExternalPayerTransfer) {
    if (!data.state) {
      throw badRequest("The state must be provided for an external transfer update.")
    }
    // Check the external payer is authenticated
    if (transfer.externalPayer?.resource.key !== ctx.accountKey) {
      throw forbidden("The logged in external payer is not the payer of the transfer")
    }

    this.transfers().checkTransferTransition(transfer, data.state)

    if (data.state === "committed") {
      // The external payer has accepted the payment request
      if (!data.hash) {
        throw badRequest("The hash must be provided for a committed external transfer update.")
      }
      const ledgerTransfer = await this.currencyController.ledger.getTransfer(data.hash)
      // Check that the payer and payee match the ledger transfer data.
      if (ledgerTransfer.payer !== transfer.externalPayer.resource.key || ledgerTransfer.payee !== transfer.payee.key) {
        throw badRequest("The payer or payee do not match the ledger transfer data.")
      }
      // Update transfer amount from ledger
      const amount = this.currencyController.amountFromLedger(ledgerTransfer.amount)
      if (data.amount !== transfer.amount) {
        transfer.amount = amount
        this.db().transfer.update({
          data: { amount },
          where: { tenantId_id: {
            id: transfer.id,
            tenantId: this.db().tenantId
          }}
        })
      }
      // Update account balances
      await this.transfers().updateAccountBalances(transfer)

      // Update state and hash
      transfer.hash = data.hash
      await this.transfers().saveTransferState(transfer, "committed")
    } else if (["rejected", "failed"].includes(data.state)) {
      // The external payer has rejected the payment request
      await this.transfers().saveTransferState(transfer, data.state)
    } else {
      throw badRequest("Invalid state for an external transfer update.")
    }
    return transfer
  }

  private async updateTransferExternalPayeeLocalUser(ctx: Context, data: UpdateTransfer, transfer: ExternalPayeeTransfer) {
    const user = await this.users().checkUser(ctx)

    // Check the payer is local.
    if (transfer.externalPayer) {
      throw badRequest("External payment requests can't be updated")
    }
    // Check the user has enough permission.
    if (!(this.users().isAdmin(user) || userHasAccount(user, transfer.payer))) {
      throw forbidden("User is not allowed to update this external transfer")
    }
    if (data.state !== undefined) {
      await this.updateTransferStateExternalPayee(ctx, transfer as ExternalPayeeTransfer, data.state, user, true)
    }
    return transfer

  }

  /**
   * Checks and updates the state of a transfer with external payee, and eventually submits the transfer to the ledger.
   */
  private async updateTransferStateExternalPayee(ctx: Context, transfer: ExternalPayeeTransfer, state: TransferState, user: User, isUpdate: boolean) {
    if (transfer.state == state) {
      return
    }
    this.transfers().checkTransferTransition(transfer, state)
    
    if (state === "committed") {
      // Cases for direct submission:
      // - Payment requested by the payer or the payer's admin.
      // - Payment requested by the external payee but local payer configured to automatically accept it.
      if (
        (ctx.type === "user" && (userHasAccount(user, transfer.payer) || this.users().isAdmin(user)))
        || (ctx.type === "external" && this.submitExternalPaymentRequestsImmediately(transfer))
      ) {
        await this.transfers().saveTransferState(transfer, "submitted")
        try {
          const transaction = await this.submitTransferExternalPayee(ctx, transfer, user)
          transfer.hash = transaction.hash
          await this.transfers().saveTransferState(transfer, "committed")
        } catch (e) {
          await this.transfers().saveTransferState(transfer, "failed")
          throw e
        }
      } else if (ctx.type === "external") {
        // In case the transfer was externally initiated but not immediately submitted, save it as 
        // "pending" waiting for the payer to approve it.
        await this.transfers().saveTransferState(transfer, "pending")
      } else {
        throw forbidden("User is not allowed to commit this external transfer")
      }
    } else if (state ===  "rejected") {
      await this.transfers().saveTransferState(transfer, "rejected")
    }
    
    // Notify the external server about the transfer if the action was initiated locally. 
    // If the action was initiated by the external server, the request response will do the job.
    if (ctx.type !== "external") {
      await this.notifyTransferExternalPayee(ctx, transfer, isUpdate)
    }
  }

  /**
   * Submits an external payment to the ledger through a path payment.
   */
  private async submitTransferExternalPayee(ctx: Context, transfer: ExternalPayeeTransfer, user: User) {
    const externalCurrency = await this.getExternalAccountCurrency(ctx, transfer.externalPayee)

    // Convert the amount to the payee (remote) currency.
    const payeeAmount = convertAmount(transfer.amount, this.currency(), externalCurrency.resource)
    const payeeAmountLedger = amountToLedger(externalCurrency.resource, payeeAmount)
    
    const path = await this.currencyController.ledger.quotePath({
      destCode: externalCurrency.resource.code,
      destIssuer: externalCurrency.resource.keys.issuer,
      amount: payeeAmountLedger,
    })

    // There is no trust path between these two accounts. The transfer is not possible.
    if (!path) {
      throw noTrustPath(`No trust path between currencies ${this.currency().code} and ${externalCurrency.resource.code}`)
    }
    // There is a trust path! Submit the transaction.

    const ledgerPayer = await this.currencyController.ledger.getAccount(transfer.payer.key)
    const transaction = await ledgerPayer.externalPay({
        payeePublicKey: transfer.externalPayee.resource.key,
        amount: payeeAmountLedger,
        path
      }, {
        account: await (this.users().isAdmin(user) ? this.keys().adminKey() : this.keys().retrieveKey(transfer.payer.key)),
        sponsor: await this.keys().sponsorKey()
      })
    
    // Update payer and external account balances in DB.
    this.transfers().updateAccountBalances(transfer)

    return transaction
  }


  private async getExternalAccount(ctx: Context, resourceId: ExternalResourceIdentifier) {
    // Fetch and save external account.
    return await this.externalResources().getExternalResource<FullAccount>(ctx, resourceId)
  }

  private async getExternalAccountCurrency(ctx: Context, externalAccount: ExternalResource<Account>) {
    // Build the currency URL from the account URL.
    const currencyHref = externalAccount.href.substring(0, externalAccount.href.lastIndexOf("/accounts/")) + "/currency"
    const currencyResourceId = {
      id: externalAccount.resource.currency.id,
      type: "currencies",
      meta: {
        href: currencyHref,
        external: true as const
      }
    }
    // Fetch and save external currency for later use.
    return await this.externalResources().getExternalResource<Currency>(ctx, currencyResourceId)
  }

  

  /**
   * Whether an external payment request can be automatically submitted without manual approval.
   */
  private submitExternalPaymentRequestsImmediately(transfer: ExternalPayeeTransfer) {
    const whitelist = transfer.payer.settings.acceptPaymentsWhitelist ?? this.currency().settings.defaultAcceptPaymentsWhitelist

    return (transfer.payer.settings.acceptExternalPaymentsAutomatically ?? this.currency().settings.defaultAcceptExternalPaymentsAutomatically)
      || (whitelist && whitelist.includes(transfer.externalPayee.id))
  }

  private buildTransfersEndpoint(account: ExternalResource<Account>) {
    return account.href.substring(0, account.href.lastIndexOf("/accounts/")) + "/transfers"
  }

  private accountToExternal(account: FullAccount): ExternalResource<FullAccount> {
    return {
      id: account.id,
      type: "accounts",
      href: `${config.API_BASE_URL}/${this.currency().code}/accounts/${account.id}`,
      resource: account
    }
  }

  private async notifyTransferExternalPayee(ctx: Context, transfer: ExternalPayeeTransfer, isUpdate: boolean) {
    // Build the external transfers endpoint from the account endpoint.
    const endpoint = this.buildTransfersEndpoint(transfer.externalPayee)
    if (!isUpdate) {
      // Build the transfer JSON:API object for the external service.
      const externalPayerTransfer: ExternalPayerTransfer = {
        ...transfer,
        externalPayee: undefined,
        payee: transfer.externalPayee.resource,
        externalPayer: this.accountToExternal(transfer.payer),
      }

      // Convert amount to payee currency
      const externalCurrency = await this.getExternalAccountCurrency(ctx, transfer.externalPayee)
      const payeeAmount = convertAmount(transfer.amount, this.currency(), externalCurrency.resource)
      externalPayerTransfer.amount = payeeAmount
      
      const response = await this.notifyCreateExternalTransfer(ctx, endpoint, externalPayerTransfer, transfer.payer.key)
      return response
    } else {
      const updateDoc = {
        data: {
          id: transfer.id,
          type: "transfers",
          attributes: {
            state: transfer.state,
            hash: transfer.hash
          }
        }
      }
      const url = `${endpoint}/${transfer.id}`
      const response = await this.notifyExternalTransferRequest("PATCH", url, updateDoc, transfer.payer.key)
      return response
    }
  }

  private async notifyTransferExternalPayer(ctx: Context, transfer: ExternalPayerTransfer) {
    // Build the external transfers endpoint from the account endpoint.
    const endpoint = this.buildTransfersEndpoint(transfer.externalPayer)

    // Build the transfer JSON:API object for the external service.
    const externalPayeeTransfer: ExternalPayeeTransfer = {
      ...transfer,
      state: "committed",
      externalPayer: undefined,
      payer: transfer.externalPayer.resource,
      externalPayee: this.accountToExternal(transfer.payee),
    }

    // Convert amount to payer currency
    const externalCurrency = await this.getExternalAccountCurrency(ctx, transfer.externalPayer)
    const payerAmount = convertAmount(transfer.amount, this.currency(), externalCurrency.resource)
    externalPayeeTransfer.amount = payerAmount

    const response = await this.notifyCreateExternalTransfer(ctx, endpoint, externalPayeeTransfer, transfer.payee.key)
    return response
  }

  private async notifyCreateExternalTransfer(ctx: Context, endpoint: string, transfer: FullTransfer, publicKey: string) {
    const data = await TransferSerializer.serialize(transfer)
    return await this.notifyExternalTransferRequest("POST", endpoint, data, publicKey)
  }

  private async notifyExternalTransferRequest(method: "POST"|"PATCH", url: string, data: any, publicKey: string) {
    // Build the external auth token
    const key = await this.keys().retrieveKey(publicKey)
    const token = await createExternalToken(key)
    // Perform the HTTP request
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/vnd.api+json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(data)
    })
    // Check the response
    if (!response.ok) {
      let body = undefined
      try {
        body = await response.text()
      } catch (e) {}
      throw internalError(`Failed to notify transfer to ${url}`, { details: {
        status: response.status,
        body,
        headers: response.headers
      }})
    }
    const resource = await response.json() as { data: any }
    const result = mount(resource.data)
    return result as FullTransfer
  }

}