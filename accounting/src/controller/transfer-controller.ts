import { Account, InputTransfer, recordToTransfer, recordToTransferWithAccounts, Transfer, TransferAuthorization, TransferState, UpdateTransfer, User, userHasAccount } from "src/model";
import { badRequest, forbidden, notFound } from "src/utils/error";
import { AbstractCurrencyController } from "./abstract-currency-controller";

import { CollectionOptions } from "src/server/request";
import { Context, systemContext } from "src/utils/context";
import { logger } from "src/utils/logger";
import { LedgerCurrencyController } from "./currency-controller";
import { ExternalTransferController } from "./external-transfer-controller";
import { includeRelations, whereFilter } from "./query";
import { TransferController as ITransferController } from "src/controller";

export class TransferController  extends AbstractCurrencyController implements ITransferController {
  private externalTransfers: ExternalTransferController

  constructor(currencyController: LedgerCurrencyController) {
    super(currencyController)
    this.externalTransfers = new ExternalTransferController(currencyController)
  }

  private async validateInputTransfer(data: InputTransfer) {
    // Check id. Allow for user-defined ids, but check for duplicates.
    if (data.id) {
      const existing = await this.db().transfer.findUnique({where: {
        tenantId_id: {
          id: data.id,
          tenantId: this.db().tenantId
        }
      }})
      if (existing) {
        throw badRequest(`Transfer with id ${data.id} already exists`)
      }
    }
    if (!["new", "committed"].includes(data.state)) {
      throw badRequest(`Invalid transfer state ${data.state}`)
    }
    if (data.amount <= 0) {
      throw badRequest("Transfer amount must be positive")
    }
    if (!(data.payer && data.payer.id)) {
      throw badRequest("Payer account id is required")
    }
    if (!(data.payee && data.payee.id)) {
      throw badRequest("Payee account id is required")
    }
    if (data.payer.id === data.payee.id) {
      throw badRequest("Payer and payee must be different")
    }
    if (data.authorization) {
      if (data.authorization.type !== "tag" || !data.authorization.value) {
        throw badRequest("Invalid authorization")
      }
    }
  }

  /**
   * Check that the user is allowed to perform this transfer.
   */
  private async validateTransferAccounts(ctx: Context, user: User, data: InputTransfer)  {
    // Already throw exception if accounts not found.
    const payer = await this.accounts().getAccount(ctx, data.payer.id)
    const payee = await this.accounts().getAccount(ctx, data.payee.id)

    // Check that user is allowed to perform the transaction
    let allowed = false

    // Admins are allowed to do anything.
    if (this.users().isAdmin(user)) {
      allowed = true
    }
    // Payer may be allowed to transfer from their account.
    else if (userHasAccount(user, payer)) {
      allowed = payer.settings.allowPayments ?? this.currency().settings.defaultAllowPayments ?? false
    }
    // Payee may be allowed to receive payments.
    else if (userHasAccount(user, payee)) {
      if (data.authorization) {
        if (data.authorization.type === "tag") {
          allowed = payee.settings.allowTagPaymentRequests ?? this.currency().settings.defaultAllowTagPaymentRequests ?? false
        }
      } else {
        allowed = payee.settings.allowPaymentRequests ?? this.currency().settings.defaultAllowPaymentRequests ?? false
      }
    }
    
    if (!allowed) {
      throw forbidden("User is not allowed to create this transfer")
    }
    return {payer, payee}
  }

  async digestAuthorization(data?: TransferAuthorization) {
    if (data && data.type === "tag" && data.value) {
      return {
        type: "tag" as const,
        hash: await this.accounts().accountTagHash(data.value)
      }
    }
    return undefined
  }
  /**
   * Implements CurrencyController.createTransfer()
   */
  async createTransfer(ctx: Context, data: InputTransfer): Promise<Transfer> {
    await this.validateInputTransfer(data)

    // If this is an external transfer, let the specialized controller handle it.
    if (this.externalTransfers.isExternalInputTransfer(data)) {
      return await this.externalTransfers.createExternalTransfer(ctx, data)
    }

    // Otherwise, this is a transfer between two accounts in this currency.
    const user = await this.users().checkUser(ctx)
    data.authorization = await this.digestAuthorization(data.authorization)

    const {payer, payee} = await this.validateTransferAccounts(ctx, user, data)

    const transfer = await this.createTransferRecord(data, payer, payee, user)

    await this.updateTransferState(transfer, data.state, user)
    return transfer
  }

  /**
   * Create the transaction in the DB with state "new".
   */
  async createTransferRecord(data: InputTransfer, payer: Account, payee: Account, user: User) {
    const record = await this.db().transfer.create({
      data: {
        id: data.id,
        state: "new",
        amount: data.amount,
        meta: data.meta,
        authorization: data.authorization,
        payer: { connect: { id: payer.id } },
        payee: { connect: { id: payee.id } },
        user: { connect: { tenantId_id: {
          id: user.id,
          tenantId: this.db().tenantId
        }}}
      }
    })

    const transfer = recordToTransfer(record, {payer, payee})
    return transfer
  }

  /**
   * Throw exception if the transition is not allowed.
   */
  public checkTransferTransition(transfer: Transfer, state: TransferState) {
    if (transfer.state == state) {
      return
    }

    if (["submitted", "pending", "failed"].includes(state)) {
      throw badRequest(`State "${state}" is only set by the system`)
    }

    // Transitions available to users:
    const transitions = {
      new: ["committed", "deleted"],
      pending: ["rejected", "committed", "deleted"],
      rejected: ["deleted"],
      failed: ["deleted"],
    }
    
    if (!(transfer.state in transitions) || !transitions[transfer.state as keyof typeof transitions].includes(state)) {
      throw badRequest(`Invalid state transition from ${transfer.state} to ${state}`)
    }
  }

  /**
   * Low level operation to update the state and hash DB fields of the transfer.
   */
  public async saveTransferState(transfer: Transfer, state: TransferState) {
    if (transfer.state !== state) {
      transfer.state = state
      
      await this.db().transfer.update({
        data: {
          state,
          hash: transfer.hash
        },
        where: {
          tenantId_id: {
            id: transfer.id,
            tenantId: this.db().tenantId
          }
        }
      })
      this.currencyController.emitter.emit("transferStateChanged", transfer, this.currencyController)
    }
  }

  /**
   * Try move the transfer to the desired state. The outcome can be the desired state,
   * a different intermediate state or a failed state. If the user is not authorized to
   * perform the transition or in other error cases, an error is thrown.
   * 
   * new ?-> pending | submitted
   * pending ?-> submitted | rejected
   * rejected ?-> deleted
   * submitted -> committed | failed
   * failed ?-> deleted
   * @returns 
   */
  private async updateTransferState(transfer: Transfer, state: TransferState, user: User) {
    // Allow identity transitions.
    if (transfer.state == state) {
      return
    }

    this.checkTransferTransition(transfer, state)

    // note that state can only be "committed", "rejected" or "deleted" at this point.

    // Trying to commit the transfer
    if (state == "committed") {
      // Cases for direct submission.
      // 1 - Admin user
      // 2 - Payer user
      // 3 - Payee user with authorized payment request.
      if (this.users().isAdmin(user)
        || userHasAccount(user, transfer.payer) 
        || (userHasAccount(user, transfer.payee) && (await this.submitPaymentRequestImmediately(transfer)))) {
        await this.saveTransferState(transfer, "submitted")
        try {
          const transaction = await this.submitTransfer(transfer, this.users().isAdmin(user))
          transfer.hash = transaction.hash
          await this.saveTransferState(transfer, "committed")
        } catch (e) {
          await this.saveTransferState(transfer, "failed")
          throw e
        }
      } else if (userHasAccount(user, transfer.payee)) {
        // Payment request pending authorization
        if (transfer.authorization) {
          await this.saveTransferState(transfer, "failed")
          throw forbidden("Invalid authorization")
        } else {
          await this.saveTransferState(transfer, "pending")
        }
      } else {
        throw forbidden("User is not allowed to commit this transfer")
      }
    }

    if (state == "rejected") { 
      if (userHasAccount(user, transfer.payer)) {
        await this.saveTransferState(transfer, "rejected")
      } else {
        throw forbidden("User is not allowed to reject this transfer")
      }
    }

    if (state == "deleted") {
      // Only transfer creator can delete it.
      if (this.users().isAdmin(user) || transfer.user.id == user.id) {
        await this.saveTransferState(transfer, "deleted")
      } else {
        throw forbidden("User is not allowed to delete this transfer")
      }
    }
  }

  private async submitPaymentRequestImmediately(transfer: Transfer) {
    // Option 1: acceptPaymentsAutomatically
    if (transfer.payer.settings.acceptPaymentsAutomatically ?? this.currency().settings.defaultAcceptPaymentsAutomatically) {
      return true
    }

    // Option 2: acceptPaymentsWhitelist
    const whitelist = transfer.payer.settings.acceptPaymentsWhitelist ?? this.currency().settings.defaultAcceptPaymentsWhitelist
    if (whitelist && whitelist.includes(transfer.payee.id)) {
      return true
    }

    // Option 3: tag authorization
    if (transfer.authorization?.type === "tag" && transfer.authorization.hash) {
      const authorizer = await this.accounts().getAccountByTag(systemContext(), transfer.authorization.hash, true)
      if (authorizer && authorizer.id === transfer.payer.id) {
        return true
      }
    }
  }

  public async updateAccountBalances(transfer: Transfer) {
    return await Promise.all([
      this.accounts().updateAccountBalance(transfer.payer),
      this.accounts().updateAccountBalance(transfer.payee)
    ])
  }

  /**
   * Submit a transfer to the ledger. Both payer and payee must be local.
   */
  private async submitTransfer(transfer: Transfer, admin = false) {
    const ledgerPayer = await this.currencyController.ledger.getAccount(transfer.payer.key)
    const transaction = await ledgerPayer.pay({
      payeePublicKey: transfer.payee.key,
      amount: this.currencyController.amountToLedger(transfer.amount),
    }, {
      sponsor: await this.keys().sponsorKey(),
      account: await (admin ? this.keys().adminKey() : this.keys().retrieveKey(transfer.payer.key))
    })

    await this.updateAccountBalances(transfer)
    
    return transaction
  }

  private async loadTransferWhere(ctx: Context, where: {id?: string, hash?: string}) {
    // We first get the transfer and later check if the user is allowed to access it.
    const record = await this.db().transfer.findUnique({
      where: {
        ...(where.id ? {tenantId_id: {
          id: where.id,
          tenantId: this.db().tenantId
        }}: undefined),
        ...(where.hash ? { tenantId_hash: {
          hash: where.hash,
          tenantId: this.db().tenantId
        }} : undefined)
      } as any,
      include: {
        payer: {
          include: { users: { include: { user: true } } }
        },
        payee: {
          include: { users: { include: { user: true } } }
        },
        externalTransfer: {
          include: {
            externalPayer: true,
            externalPayee: true
          }
        }
      }
    })
    if (!record) {
      throw notFound(`Transfer ${where.id ?? where.hash} not found`)
    }

    const transfer = recordToTransferWithAccounts(record, this.currency())

    // Transfers can be accessed by admin and by involved parties.
    if (ctx.type === "external") {
      // External users have access to the transfers they are involved in.
      if (!(ctx.accountKey === transfer.externalPayee?.resource.key || ctx.accountKey === transfer.externalPayer?.resource.key)) {
        throw forbidden("User is not allowed to access this transfer")
      }
    } else {
      const user = await this.users().checkUser(ctx)
      if (!(this.users().isAdmin(user) || userHasAccount(user, transfer.payer) || userHasAccount(user, transfer.payee))) {
        throw forbidden("User is not allowed to access this transfer")
      }
    }
    
    return transfer
  }

  /**
   * Implements getTransfer()
   */
  public async getTransfer(ctx: Context, id: string): Promise<Transfer> {
    return await this.loadTransferWhere(ctx, {id})
  }

  /**
   * Implements {@link CurrencyController.getTransferByHash}
   */
  public async getTransferByHash(ctx: Context, hash: string): Promise<Transfer> {
    return await this.loadTransferWhere(ctx, {hash})
  }

  public async getTransfers(ctx: Context, params: CollectionOptions): Promise<Transfer[]> {
    const user = await this.users().checkUser(ctx)

    const {account, ...filters} = params.filters
    const where = whereFilter(filters)
    // Special account filter.
    if (account !== undefined) {
      where.OR = [
        { payer: { id: account } },
        { payee: { id: account } }
      ]
    }
    
    // Regular users can only see transfers where they are involved.
    if (!this.users().isAdmin(user)) {
      where.AND = {
        OR: [
          { payer: { users: { some : { user : { id: user.id } } } } },
          { payee: { users: { some : { user : { id: user.id } } } } },
        ]
      }
    }
    // default state filter.
    if (!where.state) {
      where.state = { not: "deleted" }
    }

    const include = includeRelations(params.include)

    // Currency is defined as a transfer relationship in API model
    // but not in DB.
    if (include?.currency) {
      delete include.currency
    }

    const records = await this.db().transfer.findMany({
      where,
      orderBy: {
        [params.sort.field]: params.sort.order
      },
      include: {
        ...include,
        // always include accounts.
        payer: true,
        payee: true,
        // and external transfer if it exists.
        externalTransfer: {
          include: {
            externalPayer: true,
            externalPayee: true
          }
        }
      },
      skip: params.pagination.cursor,
      take: params.pagination.size,
    }) 

    const transfers = records.map(r => recordToTransferWithAccounts(r, this.currency()))

    return transfers
  }
    

  /**
   * Implements {@link CurrencyController.updateTransfer}
   */
  public async updateTransfer(ctx: Context, data: UpdateTransfer): Promise<Transfer> {
    let transfer = await this.getTransfer(ctx, data.id)

    if (this.externalTransfers.isExternalTransfer(transfer)) {
      return this.externalTransfers.updateExternalTransfer(ctx, data, transfer)
    }

    const user = await this.users().checkUser(ctx)

    // Update transfer attributes, if still not submitted.
    if (transfer.state === "new") {
      // New transfers can be updated by its creator.
      if (transfer.user.id !== user.id) {
        throw forbidden("User is not allowed to update this transfer")
      }
      if (data.amount !== undefined && data.amount <= 0) {
        throw badRequest("Transfer amount must be positive")
      }
      if (data.payer !== undefined && data.payer.id !== transfer.payer.id) {
        // Only admin can change transfer payer.
        if (user.id !== this.currency().admin.id) {
          throw forbidden("User is not allowed to change payer")
        }
        // Throw if not found
        transfer.payer = await this.accounts().getAccount(ctx, data.payer.id)
      }
      if (data.payee !== undefined && data.payee.id !== transfer.payee.id) {
        transfer.payee = await this.accounts().getAccount(ctx, data.payee.id)
      }
      const record = await this.db().transfer.update({
        data: {
          amount: data.amount,
          meta: data.meta,
          payer: { connect: { id: transfer.payer.id } },
          payee: { connect: { id: transfer.payee.id } }
        },
        where: { tenantId_id: {
          id: transfer.id,
          tenantId: this.db().tenantId
        }}
      })
      transfer = recordToTransfer(record, {payer: transfer.payer, payee: transfer.payee})
    }

    // Update state
    if (data.state !== undefined ) {
      await this.updateTransferState(transfer, data.state, user)
    }

    return transfer
  }

  public async deleteTransfer(ctx: Context, id: string): Promise<void> {
    const user = await this.users().checkUser(ctx)
    const transfer = await this.getTransfer(ctx, id)
    await this.updateTransferState(transfer, "deleted", user)
  }

  async acceptPendingTransfers(ctx: Context) {
    const N_PENDING_TRANSFERS = 100
    // Find the oldest N pending transfers (at most), if more than these are expired,
    // do them the next cron run.
    const transfers = await this.getTransfers(ctx, {
      filters: {
        state: "pending",
      },
      include: ["payer", "payee"],
      sort: {field: "updated", order: "asc"},
      pagination: {cursor: 0, size: N_PENDING_TRANSFERS}
    })
    const defaultAcceptPaymentsAfter = this.currency().settings.defaultAcceptPaymentsAfter
    for (const transfer of transfers) {
      const payerSettings = transfer.payer.settings
      // Check if the transfer is in "pending" state for more than the configured time.
      // Note that if the configured lapse is false or undefined, we don't count them.
      const lapse = payerSettings.acceptPaymentsAfter ?? defaultAcceptPaymentsAfter
      const expired = lapse && transfer.updated.getTime() + lapse*1000 < Date.now()
      // Also do it if the account just changed their config to "acceptPaymentsAutomatically"
      // or updated their whitelist.
      const immediate = await this.submitPaymentRequestImmediately(transfer)
      if (expired || immediate) {
        // Submit this transfer as admin.
        await this.updateTransferState(transfer, "committed", this.currency().admin)
      }
    }
  }

  async createMultipleTransfers(ctx: Context, transfers: InputTransfer[]): Promise<Transfer[]> {
    // Multiple transfers are only allowed for logged in users.
    await this.users().checkUser(ctx)
    // We trigger all transfers in parallel. The ledger driver will handle the
    // batching of the transactions
    const createdTransfers = await Promise.allSettled(transfers.map(async (data) => {
      try {
        const transfer = await this.createTransfer(ctx, data)
        return transfer
      } catch (e) {
        // Log errors without waiting for all tasks to fisish.
        logger.error(e)
        throw e
      }
    }))
    // Return transfers that were successfully created.
    return createdTransfers.filter(t => t.status === "fulfilled").map((t) => (t as PromiseFulfilledResult<Transfer>).value)
  }

}