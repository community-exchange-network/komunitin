import { Asset, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk"
import { LedgerAccount, LedgerTransfer, PathQuote } from "../ledger"
import { StellarCurrency } from "./currency"
import { Big } from "big.js"
import { logger } from "../../utils/logger"
import { internalError, insufficientBalance } from "../../utils/error"

export class StellarAccount implements LedgerAccount {
  public currency: StellarCurrency

  // account address = public key.
  private accountId: string

  // Use getStellarAccount() instead.
  private account: Horizon.AccountResponse | undefined

  private loadPromise: Promise<Horizon.AccountResponse> | undefined

  constructor(accountId: string, currency: StellarCurrency) {
    this.accountId = accountId
    this.currency = currency
  }

  public async update() {
    // We use the loadPromise to avoid multiple parallel calls to loadAccount().
    // Indeed, if we call load() before the previous call to loadAccount() is finished,
    // it will just wait for the previous promise and use the same result.
    if (this.loadPromise === undefined) {
      this.loadPromise = this.currency.ledger.loadAccount(this.accountId)
    }
    try {
      const loaded = await this.loadPromise
      // If we already have a loaded account, we update the sequence number of the new one
      // just in case the current account increased the sequence number while we were loading
      // the new one.
      if (this.account !== undefined && this.account.sequenceNumber() > loaded.sequenceNumber()) {
        loaded.sequence = this.account.sequenceNumber()
      }
      this.account = loaded
    } finally {
      this.loadPromise = undefined
    }
  }

  private stellarAccount() {
    if (this.account === undefined) {
      throw internalError("Account not found")
    }
    return this.account
  }

  /**
   * Return all payments made from/to this account with the local asset.
   */
  async transfers(): Promise<LedgerTransfer[]> {
    const transfers = [] as LedgerTransfer[]
    const localAsset = this.currency.asset()
    let result = await this.stellarAccount().payments({
      limit: 20,
    })
    do {
      transfers
        .push(...result.records
          .filter((r) => r.type === "payment")
          .filter(r => (r.asset_type === "credit_alphanum4" || r.asset_type === "credit_alphanum12"))
          .filter(r => r.asset_code === localAsset.code && r.asset_issuer === localAsset.issuer)
          .map((r) => ({
            amount: r.amount,
            asset: new Asset(r.asset_code as string, r.asset_issuer),
            payer: r.from,
            payee: r.to,
            hash: r.transaction_hash
          })))
      result = await result.next()
    } while (result.records.length > 0);

    return transfers;
  }

  /**
   * Implements LedgerAccount.credit()
   * 
   * Note that this call requires fetching and parsing all payments to this account.
   */
  async credit(): Promise<string> {
    const transfers = await this.transfers()
    const positive = transfers
      .filter(t => t.payer == this.currency.data.creditPublicKey)
      .reduce((amount, transfer) => Big(transfer.amount).add(amount), Big(0))
    const negative = transfers
      .filter(t => t.payee == this.currency.data.creditPublicKey)
      .reduce((amount, transfer) => Big(transfer.amount).add(amount), Big(0))
    return positive.sub(negative).toString()
  }

  /**
   *  Implements LedgerAccount.updateCredit()
   */
  async updateCredit(amount: string, keys: {
    account?: Keypair,
    credit?: Keypair,
    issuer?: Keypair,
    sponsor: Keypair
  }) {
    const currentCredit = await this.credit()
    if (!Big(amount).eq(currentCredit)) {
      const diff = Big(amount).sub(currentCredit)
      if (diff.lt(0)) {
        if (!keys.account) {
          throw internalError("Required account key when reducing the credit")
        }
        await this.pay({
          payeePublicKey: this.currency.data.creditPublicKey,
          amount: diff.abs().toString()
        }, {
          account: keys.account,
          sponsor: keys.sponsor
        })
      } else {
        if (!keys.credit) {
          throw internalError("Required credit key when increasing the credit")
        }
        const creditAccount = await this.currency.creditAccount()
        const builder = this.currency.ledger.transactionBuilder(creditAccount)

        const { issuer } = this.currency.addCreditTransaction(
          builder,
          this.account?.accountId() as string,
          diff.toString(),
          creditAccount.balance()
        )
        const signers = [keys.credit]
        if (issuer && keys.issuer) {
          signers.push(keys.issuer)
        } else if (issuer) {
          throw internalError("Required issuer key when updating credit balance")
        }
        await this.currency.ledger.submitTransaction(builder, signers, keys.sponsor)
      }
      logger.info(`Account ${this.accountId} credit updated from ${currentCredit} to ${amount}`)
      return diff.toString()
    }
    return "0"
  }

  maximumBalance(): string {
    const asset = this.currency.asset()
    const balance = this.stellarBalance(asset)
    if (!balance) {
      throw internalError(`Unexpected account without ${asset.code} currency balance`)
    }
    return balance.limit
  }

  /**
   * Implements {@link LedgerAccount#updateMaximumBalance }
   */
  async updateMaximumBalance(amount: string | undefined, keys: { account: Keypair, sponsor: Keypair }): Promise<void> {
    if (amount === undefined || amount !== this.maximumBalance()) {
      const builder = this.currency.ledger.transactionBuilder(this)
      builder.addOperation(Operation.changeTrust({
        asset: this.currency.asset(),
        limit: amount,
      }))
      // Note that it is not necessary to authorize the trustline change with the issuer key.
      await this.currency.ledger.submitTransaction(builder, [keys.account], keys.sponsor)
      logger.info(`Account ${this.accountId} maximum balance updated to ${amount}`)
    }
  }

  private stellarBalance(asset: Asset) {
    if (this.account === undefined) {
      throw internalError("Account not found")
    }

    const balance = this.account.balances.find((b) => {
      if (b.asset_type == asset.getAssetType()) {
        const balance = b as Horizon.HorizonApi.BalanceLineAsset
        return (balance.asset_issuer == asset.issuer && balance.asset_code == asset.code)
      }
      return false
    })
    return balance as Horizon.HorizonApi.BalanceLineAsset | undefined
  }
  /**
   * Implements { @link LedgerAccount.balance }
   */
  balance(asset?: Asset) {
    if (asset === undefined) {
      asset = this.currency.asset()
    }
    const balance = this.stellarBalance(asset)
    if (!balance) {
      if (asset.getIssuer() === this.accountId) {
        return Number.MAX_SAFE_INTEGER.toString()
      }
      throw internalError(`Unexpected account without ${asset.code} currency balance`)
    }
    return balance.balance
  }

  balances() {
    if (this.account === undefined) {
      throw internalError("Account not found")
    }
    return (this.account.balances as Horizon.HorizonApi.BalanceLineAsset[])
      .filter(b => b.asset_type == "credit_alphanum4" || b.asset_type == "credit_alphanum12")
      .map(b => ({ asset: new Asset(b.asset_code, b.asset_issuer), balance: b.balance, limit: b.limit }))
  }

  moveBalanceAndDeleteTransaction(builder: TransactionBuilder, destination: string, asset: Asset = this.currency.asset()) {
    if (this.account === undefined) {
      throw internalError("Account not found")
    }
    const source = this.account.accountId()
    const balance = this.balance(asset)

    if (Big(balance).gt(0)) {
      // Send all the balance to the destination account
      builder.addOperation(Operation.payment({
        source,
        destination,
        asset,
        amount: balance
      }))
    }
    // Remove the trustline.
    builder.addOperation(Operation.changeTrust({
      source,
      asset,
      limit: "0"
    }))
    // Delete the account.
    builder.addOperation(Operation.accountMerge({
      source,
      destination: this.currency.ledger.sponsorPublicKey.publicKey()
    }))

  }

  private async moveBalanceAndDelete(destination: string, keys: { admin: Keypair, sponsor: Keypair }) {
    const builder = this.currency.ledger.transactionBuilder(this)
    this.moveBalanceAndDeleteTransaction(builder, destination)

    const result = await this.currency.ledger.submitTransaction(builder, [keys.admin], keys.sponsor)
    this.account = undefined

    return result
  }

  /**
   * Implements {@link LedgerAccount#delete }
   */
  async delete(keys: {
    admin: Keypair,
    sponsor: Keypair
  }) {
    await this.moveBalanceAndDelete(this.currency.data.creditPublicKey, keys)
    logger.info(`Account ${this.account?.accountId()} deleted`)
  }

  /**
   * Implements LedgerAccount.pay().
   * 
   * Uses channel accounts if more than one payment is concurrently made with the same account.
   */
  async pay(payment: { payeePublicKey: string; amount: string }, keys: { account: Keypair; sponsor: Keypair }) {
    if (Big(this.balance()).lt(payment.amount)) {
      throw insufficientBalance(`Payer's balance ${this.balance()} is not sufficient for a payment of ${payment.amount}`)
    }
    const builder = this.currency.ledger.transactionBuilder(this)
    builder.addOperation(Operation.payment({
      source: this.account?.accountId() as string,
      destination: payment.payeePublicKey,
      asset: this.currency.asset(),
      amount: payment.amount
    }))
    logger.debug(`Submitting payment of ${payment.amount} with sequence ${this.account?.sequenceNumber()}`)
    const transaction = await this.currency.ledger.submitTransaction(builder, [keys.account], keys.sponsor)

    const transfer = {
      amount: payment.amount,
      asset: this.currency.asset(),
      payer: this.account?.accountId() as string,
      payee: payment.payeePublicKey,
      hash: transaction.hash
    }

    // This should be done as a reaction to a stream listener on horizon server, but we don't have
    // any means to efficiently listen all payments in a currency right now. Maybe having our own
    // filtered Horizon server could do the job, or using stellar.expert or another API.
    this.currency.ledger.emitter.emit("transfer", this.currency, transfer)

    logger.info({ hash: transaction.hash }, `Account ${this.account?.accountId()} paid ${payment.amount} to ${payment.payeePublicKey}`)

    return transfer
  }

  /**
   * Get the Stellar account object.
   * @returns The Stellar account object.
   */
  getStellarAccount() {
    if (this.account === undefined) {
      throw internalError("Account not found")
    }
    return this.account
  }

  /**
   * Implements {@link LedgerAccount#externalPay}
   */
  async externalPay(payment: { payeePublicKey: string, amount: string, path: PathQuote }, keys: { account: Keypair; sponsor: Keypair }) {

    if (Big(this.balance()).lt(payment.path.sourceAmount)) {
      throw insufficientBalance("Insufficient balance")
    }

    const builder = this.currency.ledger.transactionBuilder(this)
    const source = this.account?.accountId() as string

    builder.addOperation(Operation.pathPaymentStrictReceive({
      source,
      sendAsset: payment.path.sourceAsset as Asset,
      sendMax: payment.path.sourceAmount,
      destination: payment.payeePublicKey,
      destAsset: payment.path.destAsset as Asset,
      destAmount: payment.amount,
      path: payment.path.path as Asset[]
    }))

    const transaction = await this.currency.ledger.submitTransaction(builder, [keys.account], keys.sponsor)

    const transfer = {
      amount: payment.amount,
      asset: payment.path.destAsset as Asset,
      payer: this.account?.accountId() as string,
      payee: payment.payeePublicKey,
      hash: transaction.hash,
      sourceAsset: payment.path.sourceAsset as Asset,
      // We may need to get the source amount from the result instead of directly
      // take this amount, but in our case of 1:1 exchange rate, it must be the same.
      sourceAmount: payment.path.sourceAmount
    }

    logger.info({ hash: transaction.hash }, `Account ${this.account?.accountId()} paid ${payment.amount} ${payment.path.destAsset.code} to ${payment.payeePublicKey} through path`)

    return transfer
  }

  /**
   * Disable an active account. It wont be able to send or receive payments until it is 
   * enabled again.
   * 
   * The account is removed from the ledger, the ledger balance is moved to a central pool and
   * the account balance is only saved in the local DB.
   * 
   * The caller should be sure that the currency already has a disabled accounts pool created.
   */
  async disable(keys: { admin: Keypair, sponsor: Keypair }): Promise<void> {
    if (this.account === undefined) {
      throw internalError("Account not found")
    }
    if (!this.currency.data.disabledAccountsPoolPublicKey) {
      throw internalError("Currency does not have a disabled accounts pool")
    }
    const accountId = this.account.accountId()
    const response = await this.moveBalanceAndDelete(this.currency.data.disabledAccountsPoolPublicKey, keys)
    logger.info({ hash: response.hash, account: accountId }, `Account ${accountId} disabled in currency ${this.currency.config.code}`)
  }

}
