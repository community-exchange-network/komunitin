import { createHash } from 'crypto'
import { v4 as uuid } from "uuid"
import { AbstractCurrencyController } from "../controller/abstract-currency-controller"
import { Context } from "../utils/context"
import { CreditCommonsNode, CreditCommonsTransaction, CreditCommonsEntry } from "../model/creditCommons"
import { badRequest, notImplemented, unauthorized, noTrustPath, notFound, forbidden } from "src/utils/error"
import { FullTransfer, InputTransfer, TransferMeta } from "src/model/transfer"
import { systemContext } from "src/utils/context"
import { Transfer } from "src/model"
import { logger } from "../utils/logger"
import { config } from 'src/config'

function formatDateTime(d: Date) {
  const year = ('0000'+(d.getUTCFullYear())).slice(-4)
  const month = ('00'+(d.getUTCMonth()+1)).slice(-2)
  const day = ('00'+(d.getUTCDate())).slice(-2)
  const hour = ('00'+(d.getUTCHours())).slice(-2)
  const minutes = ('00'+(d.getUTCMinutes())).slice(-2)
  const seconds = ('00'+(d.getUTCSeconds())).slice(-2)
  return `${year}-${month}-${day} ${hour}:${minutes}:${seconds}`
}

function makeHash(transaction: CreditCommonsTransaction, lastHash: string): string {
  const str = [
    lastHash,
    transaction.uuid,
    transaction.state,
    transaction.entries.map(e => `${e.quant}|${e.description}`).join('|'),
    transaction.version,
  ].join('|');
  return createHash('md5').update(str).digest('hex');
}

function ledgerOf(ccAddress: string): string {
  const parts = ccAddress.split('/')
  if (parts.length === 1) {
    return ''
  }
  const ledgerParts = parts.slice(0, parts.length - 1)
  return ledgerParts.join('/') + '/'
}

function accountOf(ccAddress: string): string {
  const ledger = ledgerOf(ccAddress)
  return ccAddress.substring(ledger.length)
}

export interface CCAccountSummary {
  trades: number,
  entries: number,
  gross_in: number,
  gross_out: number,
  partners: number,
  pending: number,
  balance: number
}

export interface CCAccountHistory {
  data: Record<string, number>,
  meta: {
    min: number,
    max: number,
    points: number,
    start: string,
    end: string
  }
}

export interface CCTransactionResponse {
  data: CreditCommonsEntry[],
  meta: {
    secs_valid_left: number,
  }
}

export interface AccountAddresses {
  creditCommons?: string,
  komunitin: string
}

export interface CreditCommonsController {
  getWelcome(ctx: Context): Promise<{ message: string }>
  createNode(ctx: Context, data: CreditCommonsNode): Promise<CreditCommonsNode>
  createTransaction(ctx: Context, transaction: CreditCommonsTransaction): Promise<{
    body: CCTransactionResponse,
    trace: string
  }>
  updateTransaction(ctx: Context, transId: string, newState: string): Promise<void>
  getAccount(ctx: Context, accountCode: string): Promise<{
    body: CCAccountSummary,
    trace: string
  }>
  getAccountHistory(ctx: Context, accountCode: string): Promise<{
    body: CCAccountHistory,
    trace: string
  }>
  getAccountAddresses(ctx: Context, id: string): Promise<AccountAddresses>
  isCreditCommonsTransfer(transfer: Transfer|InputTransfer): boolean
  createCreditCommonsTransfer(ctx: Context, transfer: InputTransfer): Promise<FullTransfer>
}

export class CreditCommonsControllerImpl extends AbstractCurrencyController implements CreditCommonsController {
  private async checkLastHashAuth(ctx: Context): Promise<{ vostroId: string, ourNodePath: string, responseTrace: string }> {
    if (ctx.type !== 'last-hash') {
      throw unauthorized('no last-hash auth found in context')
    }
    const record = await this.db().creditCommonsNode.findFirst({})
    if (!record) {
      throw unauthorized('This currency has not (yet) been grafted onto any CreditCommons tree.')
    }
    if (record.peerNodePath !== ctx.lastHashAuth?.peerNodePath) {
      throw unauthorized(`cc-node ${JSON.stringify(ctx.lastHashAuth?.peerNodePath)} is not our trunkward node.`)
    }
    if (record.lastHash !== ctx.lastHashAuth?.lastHash) {
      throw unauthorized(`value of last-hash header ${JSON.stringify(ctx.lastHashAuth?.lastHash)} does not match our records.`)
    }
    const ourNodePathParts = record.ourNodePath.split('/')
    const ourNodeName = ourNodePathParts[ourNodePathParts.length - 1]

    return {
      vostroId: record.vostroId,
      ourNodePath: record.ourNodePath,
      responseTrace: `${ctx.lastHashAuth.requestTrace}, <${ourNodeName}`
    }
  }
  async createNode(ctx: Context, data: CreditCommonsNode): Promise<CreditCommonsNode> {
    // Only admins are allowed to set the trunkward node:
    await this.users().checkAdmin(ctx)
    await this.db().creditCommonsNode.create({
      data: {
        tenantId: this.db().tenantId,
        peerNodePath: data.peerNodePath,
        ourNodePath: data.ourNodePath,
        lastHash: data.lastHash,
        url: data.url,
        vostroId: data.vostroId
      }
    });

    return data as CreditCommonsNode;
  }
  async updateNodeHash(peerNodePath: string, lastHash: string): Promise<void> {
    logger.info(`Updating hash for CreditCommons node ${peerNodePath} to '${lastHash}'`)
    await this.db().creditCommonsNode.update({
      where: {
        tenantId_peerNodePath: {
          tenantId: this.db().tenantId,
          peerNodePath
        }
      },
      data: {
        lastHash
      }
    });
  }
  async getWelcome(ctx: Context) {
    await this.checkLastHashAuth(ctx)
    return { message: 'Welcome to the Credit Commons federation protocol.' }
  }
  private async ccToLocal(transaction: CreditCommonsTransaction, ourNodePath: string, vostroId: string, outgoing: boolean): Promise<InputTransfer> {
    // 1. Compute the overall result of the CC transaction, which will be 
    // the amount of the local transfer. Also do some sanity checks.
    const ledgerBase = `${ourNodePath}/`
    let netGain = 0
    let localParty = null
    for (let i=0; i < transaction.entries.length; i++) {
      logger.info(`Checking entry ${transaction.entries[i].payer} -> ${transaction.entries[i].payee} on ${ledgerBase}`)
      let thisLocalParty;
      if (ledgerOf(transaction.entries[i].payer) === ledgerBase) {
        thisLocalParty = transaction.entries[i].payer.slice(ledgerBase.length)
        netGain -= transaction.entries[i].quant
        logger.info(`This entry COSTS us ${transaction.entries[i].quant}`)
      }
      if (ledgerOf(transaction.entries[i].payee) === ledgerBase) {
        if (thisLocalParty) {
          throw badRequest('Payer and Payee cannot both be local')
        }
        thisLocalParty = transaction.entries[i].payee.slice(ledgerBase.length)
        netGain += transaction.entries[i].quant
        logger.info(`This entry YIELDS us ${transaction.entries[i].quant}`)
      }
      if (!thisLocalParty) {
        throw badRequest('Payer and Payee cannot both be remote')
      }
      if (localParty && localParty !== thisLocalParty) {
        throw badRequest('All entries must be to or from the same local account')
      }
      localParty = thisLocalParty
    }
    logger.info(`Net gain is ${netGain}`)

    if (netGain <= 0 && outgoing === false) {
      throw badRequest('Net gain must be positive for incoming transaction')
    }
    if (netGain >= 0 && outgoing === true) {
      throw badRequest('Net gain must be negative for outgoing transaction')
    }

    // 2. Compute the counterparty account address and description to show.
    const mainEntry = transaction.entries.reduce((max, entry) => 
      (entry.quant > max.quant) ? entry : max
    )
    const mainRemotePartyAddress = ledgerOf(mainEntry.payer) === ledgerBase
      ? mainEntry.payee
      : mainEntry.payer
    const mainDescription = mainEntry.description || ""

    // Build extra description from other entries.
    const extraDescription = transaction.entries
      .filter(e => e !== mainEntry)
      .map(e => {
        const components = (ledgerOf(e.payer) === ledgerBase)
          ? [`-${e.quant}`, e.payee, e.description] // local payer
          : [`+${e.quant}`, e.payer, e.description] // remote payer
        return "(" + components.filter(c => c).join(' ') + ")" // the filter is just to ignore empty descriptions
      }).join(', ')
    
    const description = mainDescription + (extraDescription ? `\n${extraDescription}` : '')

    // 3. Create the local transfer object.

    // if recipientId is a code like NET20002
    // then payeeId is an account ID like
    // 2791faf5-4566-4da0-99f6-24c41041c50a
    let payeeId
    if (localParty) {
       payeeId = await this.accountCodeToAccountId(localParty);
    }
    if (!payeeId) {
      throw notFound(`local party ${localParty} not found on ${ourNodePath}`)
    }
    let payer = { id: vostroId, type: 'account' }
    let payee = { id: payeeId, type: 'account' }

    const meta: TransferMeta = { 
      description,
      creditCommons: {
        payerAddress: mainRemotePartyAddress
      }
    }
    
    if (outgoing) {
      netGain = -netGain
      payer = { id: payeeId, type: 'account' }
      payee = { id: vostroId, type: 'account' }
      meta.creditCommons = {
        payeeAddress: mainRemotePartyAddress
      }
    }

    return {
      id: transaction.uuid,
      state: 'committed',
      amount: this.currencyController.amountFromLedger(netGain.toString()),
      meta,
      payer,
      payee,
    }
  }
  async createTransaction(ctx: Context, transaction: CreditCommonsTransaction): Promise<{ body:  CCTransactionResponse, trace: string }>{
    const { vostroId, ourNodePath, responseTrace } = await this.checkLastHashAuth(ctx)
    const localTransfer = await this.ccToLocal(transaction, ourNodePath, vostroId, false)
    await this.transfers().createTransfer(systemContext(), localTransfer)
    const newHash = makeHash(transaction, ctx.lastHashAuth!.lastHash)
    await this.updateNodeHash(ctx.lastHashAuth!.peerNodePath, newHash)
    return {
      body: {
        data: transaction.entries,
        meta: {
          secs_valid_left: 0
        }
      },
      trace: responseTrace
    }
  }
  async updateTransaction(ctx: Context, transId: string, newState: string) {
    await this.checkLastHashAuth(ctx)
    // Check if the transaction exists
    await this.transfers().getTransfer(systemContext(), transId)
    throw notImplemented('not implemented yet')
  }
  private async accountCodeToAccountId(accountCode: string): Promise<string | undefined> {
    const account = await this.accounts().getAccountBy(systemContext(), "code", accountCode)
    return account?.id
  }
  private async getTransactions(accountCode: string): Promise<{ transfersIn: Transfer[], transfersOut: Transfer[] }> {
    const accountId = await this.accountCodeToAccountId(accountCode)
    if (!accountId) {
      return { transfersIn: [], transfersOut: [] }
    }
    const transfers = await this.transfers().getTransfers(systemContext(), {
      filters: {
        state: 'committed',
        account: accountId
      },
      include: [],
      sort: {field: "updated", order: "asc"},
      pagination: {cursor: 0, size: 100}
    } as unknown as any)
    return {
      transfersIn: (transfers).filter(t => t.payee.id === accountId),
      transfersOut: (transfers).filter(t => t.payer.id === accountId)
    }
  }

  private async makeRoutingDecision(transaction?: CreditCommonsTransaction): Promise<CreditCommonsNode | null> {
    return await this.db().creditCommonsNode.findFirst({})
  }
  private async makeRemoteCall(transaction: CreditCommonsTransaction, remoteNode: CreditCommonsNode): Promise<void> {
    const response = await fetch(`${remoteNode.url}transaction/relay`, {
      method: 'POST',
      body: JSON.stringify(transaction, null, 2),
      headers: {
        'Content-Type': 'application/json',
        'cc-node': accountOf(remoteNode.ourNodePath),
        'last-hash': remoteNode.lastHash
      }
    })
    if (response.status !== 201 && response.status !== 200) {
      logger.error(`CreditCommons transaction failed remotely. Response code: ${response.status}`)
      logger.error(`Response text: ${await response.text()}`)
      throw noTrustPath('CreditCommons transaction failed remotely')
    }
  }

  async getAccount(ctx: Context, accountId: string): Promise<{ body: CCAccountSummary, trace: string }> {
    const { responseTrace } = await this.checkLastHashAuth(ctx)
    const { transfersIn, transfersOut } = await this.getTransactions(accountId)

    let grossIn = 0
    let grossOut = 0
    let balance = 0
    transfersIn.forEach(t => {
      grossIn += t.amount
      balance += t.amount
    })
    transfersOut.forEach(t => {
      grossOut += t.amount
      balance -= t.amount
    })
    return {
      body: {

        trades: transfersIn.length, // FIXME: Can we remember this?
        entries: transfersIn.length,
        gross_in: parseFloat(this.currencyController.amountToLedger(grossIn)),
        gross_out: parseFloat(this.currencyController.amountToLedger(grossOut)),
        partners: 0, // ?
        pending: 0,
        balance: parseFloat(this.currencyController.amountToLedger(balance))
      },
      trace: responseTrace
    }
  }
  async getAccountHistory(ctx: Context, accountCode: string): Promise<{ body: CCAccountHistory, trace: string }> {
    const { responseTrace } = await this.checkLastHashAuth(ctx)
    const { transfersIn, transfersOut } = await this.getTransactions(accountCode)
    const transfers = transfersIn.concat(transfersOut.map(t => { t.amount = -t.amount; return t }))
    let data: Record<string, number> = {}
    let min = Infinity
    let max = 0
    let start = new Date('9999')
    let end = new Date('0000')

    transfers.forEach((t: Transfer) => {
      const amount = parseFloat(this.currencyController.amountToLedger(t.amount))
      data[formatDateTime(t.created)] = amount
      if (amount < min) { min = amount }
      if (amount > max) { max = amount }
      if (t.created < start) { start = t.created }
      if (t.created > end) { end = t.created }
    })
    return {
      body: {
        data,
        meta: {
          min,
          max,
          points: 0, // ?
          start: formatDateTime(start),
          end: formatDateTime(end)
        }
      },
      trace: responseTrace
    };
  }
  async getAccountAddresses(ctx: Context, id: string): Promise<AccountAddresses> {
    const account = await this.accounts().getAccount(ctx, id)
    const adresses = {
      komunitin: `${config.API_BASE_URL}/${account.currency.code}/accounts/${account.id}`
    } as AccountAddresses
    const remoteNode = await this.makeRoutingDecision()
    if (remoteNode) {
      adresses.creditCommons = `${remoteNode.ourNodePath}/${account.code}`
    }
    return adresses
  }

  /**
   * Right now only sending transfers to a Credit Commons payee is supported.
   */
  isCreditCommonsTransfer(transfer: Transfer|InputTransfer): boolean {
    logger.debug('isCreditCommonsTransfer check', transfer.meta.creditCommons?.payeeAddress)
    return transfer.meta.creditCommons?.payeeAddress !== undefined
  }

  /**
   * Creates a Credit Commons transfer. Only supports sending transfers to a Credit Commons
   * payee. The transfer object must have the `meta.creditCommons.payeeAddress` field set.
   * 
   *
   * @param ctx The context of the request.
   * @param transfer The transfer object to create.
   * @returns The created FullTransfer object.
   */
  async createCreditCommonsTransfer(ctx: Context, data: InputTransfer): Promise<FullTransfer> {
    // Only users with accounts in this currency can create transfers.
    const user = await this.users().checkUser(ctx)

    // Check currency settings.
    if (!this.currency().settings.enableCreditCommonsPayments) {
      throw forbidden('Credit Commons payments are not enabled for this currency.')
    }

    // Get the destination address.
    const ccPayeeAddress = data.meta?.creditCommons?.payeeAddress
    if (!ccPayeeAddress) {
      throw badRequest('Credit Commons transfer must have a payee address in meta.creditCommons.payeeAddress')
    }

    const remoteNode = await this.makeRoutingDecision(undefined)
    if (!remoteNode) {
      throw notFound('This currency has not yet been grafted onto any CreditCommons tree.')
    }

    // Create the local transfer record between the user's account and the vostro account,
    // with state="new"
    const vostro = await this.accounts().getFullAccount(remoteNode.vostroId)
    const payer = await this.accounts().getFullAccount(data.payer.id)

    const transfer = await this.transfers().createTransferRecord(data, payer, vostro, user)

    // Now it is time to submit the transaction. 
     
    // 1. Perform first the local part.
    await this.transfers().updateTransferState(transfer, data.state, user)

    // 2. Send the Credit Commons transaction if the local part was successful.
    if (transfer.state === 'committed') {
      try {
        const amount = this.currencyController.amountToLedger(data.amount)
        const transaction = {
          version: 1,
          uuid: uuid(),
          state: 'V',
          workflow: '|P-PC+CX+',
          entries: [{
            payee: ccPayeeAddress,
            payer: `${remoteNode.ourNodePath}/${payer.code}`,
            quant: parseFloat(amount),
            description: data.meta.description,
            metadata: {}
          }],
        }
        await this.makeRemoteCall(transaction, remoteNode)
        const newHash = makeHash(transaction, remoteNode.lastHash)
        await this.updateNodeHash(remoteNode.peerNodePath, newHash)
      } catch (err) {
        // Should we revert the local transfer in case of CC error?
        // Reverting transfers is not implemented yet but it is planned. Of course it
        // is not really straightforward because they are immutable on the ledger.
        throw err
      }
    }

    return transfer
  }
}