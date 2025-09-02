import { Networks, Horizon, Keypair, TransactionBuilder, BASE_FEE, Transaction, Memo, MemoType, Operation, NetworkError, FeeBumpTransaction } from "@stellar/stellar-sdk"
import { sleep } from "../../utils/sleep"
import { Ledger, LedgerCurrencyConfig, LedgerCurrencyKeys, LedgerCurrencyData, LedgerEvents, LedgerCurrencyState } from "../ledger"
import { StellarAccount } from "./account"
import { StellarCurrency } from "./currency"
import Big from "big.js"
import { logger } from "../../utils/logger"
import TypedEmitter from "typed-emitter"
import {EventEmitter} from "node:events"
import { KError, transactionError, internalError, notImplemented } from "../../utils/error"
import { rateLimitRunner } from "src/utils/ratelimit"

export type StellarLedgerConfig = {
  server: string,
  network: "testnet" | "local" | "public",
  sponsorPublicKey: string,
  domain: string
  channelAccountSecretKeys?: string[]
  hourlyRateLimit?: number
}

export interface StellarTransactionBuilder extends TransactionBuilder {
  channelAccountIndex?: number
}

export const createStellarLedger = async (config: StellarLedgerConfig, sponsorKey: Keypair): Promise<Ledger> => {
  const ledger = new StellarLedger(config)
  await ledger.init(sponsorKey)
  return ledger
}

/**
 * This is a singleton class. It is used to manage the connection to the Stellar network.
 */
export class StellarLedger implements Ledger {
  
  private server: Horizon.Server
  private network: Networks
  public sponsorPublicKey: Keypair
  public domain: string

  private channelAccountSecretKeys: Keypair[] | undefined
  private channelAccountIndex: number = 0

  public static STELLAR_TIMEOUT_SECONDS = 300

  public emitter: TypedEmitter<LedgerEvents>

  // issuer public key => currency
  private currencies: Record<string, StellarCurrency> = {}

  // A map of the transactions that are currently being processed. Keys
  // are the source account public key.
  private concurrentTransactions: {[key: string]: Promise<Horizon.HorizonApi.SubmitTransactionResponse>|undefined} = {}

  private sponsorAccount: Horizon.AccountResponse | undefined
  private channelAccounts: Horizon.AccountResponse[] | undefined
 
  private rateLimiter

  /**
   * Create a new instance of the StellarLedger class. Note that a single instance should be used for a sponsor account
   * and set of currencies. So in practice, this class must be used as a singleton.
   * 
   * @param server The URL of the Horizon server to connect to. For example, "https://horizon-testnet.stellar.org"
   * @param network The Stellar Network Passphase to use. For example Networks.TESTNET
   * @param sponsor The Keypair of the sponsor account. This account must be funded with XLM. No two instances of this
   * class (in the same or different processes) should use the same sponsor account. Otherwise, there will be conflicts
   * with the sequence numbers.
   */
  constructor(config: StellarLedgerConfig) {
    const networks = {
      testnet: Networks.TESTNET,
      local: Networks.STANDALONE,
      public: Networks.PUBLIC
    }
    this.server = new Horizon.Server(config.server)
    this.network = networks[config.network]
    this.sponsorPublicKey = Keypair.fromPublicKey(config.sponsorPublicKey)
    this.domain = config.domain
    this.emitter = new EventEmitter() as TypedEmitter<LedgerEvents>

    this.channelAccountSecretKeys = config.channelAccountSecretKeys?.map((secret) => {
      return Keypair.fromSecret(secret)
    })

    // Horizon has a limit of PER_HOUR_RATE_LIMIT requests/hour/IP. This is set to 3600 by default and
    // 72000 in local standalone network as per Stellar documentation. Then it also sets a maximum "burst"
    // of 100 requests. This means that we can send 100 requests concurrently, but then we need to wait 
    // for the time allocated for these 100 requests. This is (1 hour / PER_HOUR_RATE_LIMIT) * 100.
    
    // For local that'd be 5s, and for testnet 100s. However, in practice, local horizon returns 6 (seconds) 
    // in header x-ratelimit-reset and the testnet seems to support a greater number of concurrent requests (?).
    // Maybe the testnet works better because of a longer ledger time and hence naturally more time between 
    // requests.

    // We set the rate at 90 requests per 6 seconds.
    
    this.rateLimiter = rateLimitRunner(90, 6000)
    
    // Always log errors in event handlers.
    this.addListener("error", (error: any) => {
      logger.error(error)
    })
  }

  public async init(sponsorKey: Keypair) {
    this.sponsorAccount = await this.loadAccount(this.sponsorPublicKey.publicKey())
    await this.loadChannelAccounts(sponsorKey)
  }

  private async loadChannelAccounts(sponsorKey: Keypair) {
    if (this.channelAccountSecretKeys === undefined || this.channelAccountSecretKeys.length === 0) {
      return
    }
    
    // Check if accounts exist
    const publicKeys = this.channelAccountSecretKeys.map(k => k.publicKey())
    const results = await Promise.allSettled(publicKeys.map((key) => this.loadAccount(key)))
    // Create accounts in a single transaction
    if (results.some(r => r.status === "rejected")) {
      const rejectedIndexes = []
      const transaction = this.sponsorTransactionBuilder()
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === "rejected") {
          const key = this.channelAccountSecretKeys[i]
          transaction.addOperation(Operation.beginSponsoringFutureReserves({
            sponsoredId: key.publicKey()
          }))
          .addOperation(Operation.createAccount({
            destination: key.publicKey(),
            startingBalance: "0"
          }))
          .addOperation(Operation.endSponsoringFutureReserves({
            source: key.publicKey()
          }))
          rejectedIndexes.push(i)
        }
      }
      const keys = rejectedIndexes.map(i => this.channelAccountSecretKeys![i])
      await this.submitTransaction(transaction, [...keys, sponsorKey], sponsorKey)
      // Reload and replace rejected results by the loaded accounts.
      const reload = await Promise.allSettled(rejectedIndexes.map(
        (i) => this.loadAccount(this.channelAccountSecretKeys![i].publicKey())
      ))
      for (let i = 0; i < rejectedIndexes.length; i++) {
        results[rejectedIndexes[i]] = reload[i]
      }
      logger.info(`Created ${rejectedIndexes.length} new channel accounts`)
    }
    // Set class member
    if (results.some(r => r.status === "rejected")) {
      throw internalError("Failed to create channel accounts", {details: results})
    }
    this.channelAccounts = results.map(r => (r as PromiseFulfilledResult<Horizon.AccountResponse>).value)
    logger.info(`Loaded ${this.channelAccounts.length} channel accounts`)
  }

  /**
   * Implements {@link Ledger.addListener}
   */
  public addListener(event: keyof LedgerEvents, handler: any) {
    const safeHandler = async (...args: any[]) => {
      try {
        await handler(...args)
      } catch (error) {
        this.emitter.emit("error", error as Error)
      }
    }
    return this.emitter.addListener(event, safeHandler)
  }

  /**
   * Implements {@link Ledger.removeListener}
   */
  public removeListener(event: keyof LedgerEvents, listener: any) {
    return this.emitter.removeListener(event, listener)
  }

  /**
   * Implements {@link Ledger.stop}
   */
  public stop() {
    this.emitter.removeAllListeners()
    for (const currency of Object.values(this.currencies)) {
      currency.stop()
    }
    this.currencies = {}
  }

  /**
   * Return a TransactionBuilder with fee and network.
   * @param account The source account.
   * @returns 
   */
  transactionBuilder(account: StellarAccount): StellarTransactionBuilder {
    return this.stellarTransactionBuilder(account.getStellarAccount())
  }
  sponsorTransactionBuilder(): StellarTransactionBuilder {
    if (this.sponsorAccount === undefined) {
      throw internalError("Ledger not initialized")
    }
    // Dont use channel accounts for sponsor-leaded transactions.
    return this.rawStellarTransactionBuilder(this.sponsorAccount)
  }
  private baseFee() {
    return BASE_FEE
  }

  private channelAccountStellarTransactionBuilder() {
    if (this.channelAccounts === undefined || this.channelAccounts.length === 0) {
      throw internalError("No channel accounts defined")
    }
    const index = this.channelAccountIndex
    this.channelAccountIndex = (this.channelAccountIndex + 1) % this.channelAccounts.length
    const account = this.channelAccounts[index]
    const builder = this.rawStellarTransactionBuilder(account) as StellarTransactionBuilder
    builder.channelAccountIndex = index
    return builder
  }

  private stellarTransactionBuilder(account: Horizon.AccountResponse) {
    if (this.channelAccounts === undefined || this.channelAccounts.length === 0 || this.concurrentTransactions[account.accountId()] === undefined) {
      return this.rawStellarTransactionBuilder(account)
    } else {
      // THere is a concurrent transaction from this account. Use a channel account for better throughput.
      return this.channelAccountStellarTransactionBuilder()
    }
  }

  private rawStellarTransactionBuilder(source: Horizon.AccountResponse) {
    return new TransactionBuilder(source, {
      networkPassphrase: this.network,
      fee: this.baseFee()
    })
  }

  /**
   * Submit the transaction to the Stellar network.
   * @param transaction 
   * @param keys The set of keys required to sign the transaction.
   * @param sponsorKey The key of the sponsor account.
   * @returns 
   */
  async submitTransaction(builder: StellarTransactionBuilder, keys: Keypair[], sponsorKey: Keypair) {
    try {
      const inner = builder.setTimeout(StellarLedger.STELLAR_TIMEOUT_SECONDS).build()

      // Add the channel account key to signers if required.
      const signers = builder.channelAccountIndex === undefined ? keys : [this.channelAccountSecretKeys![builder.channelAccountIndex], ...keys]
      inner.sign(...signers)
      
      // If the transaction is not sent by the sponsor account itself, we 
      // wrap it into a fee-bump transaction so the fee is always payed by the 
      // sponsor.
      let transaction: Transaction<Memo<MemoType>, Operation[]> | FeeBumpTransaction

      if (inner.source !== sponsorKey.publicKey()) {
        transaction = TransactionBuilder.buildFeeBumpTransaction(sponsorKey, this.baseFee(), inner, this.network)
        transaction.sign(sponsorKey)
      } else {
        transaction = inner
      }
      
      return await this.submitTransactionWithRetry(transaction)
      
    } catch (error) {
      if (this.isFeeError(error)) {
        // TODO: Handle the insufficient fee error by waiting a reasonable amount of
        // time before increasing the fee up to a maximum value.
        // https://developers.stellar.org/docs/learn/encyclopedia/error-handling
        throw notImplemented("Implement fee strategy", error)
      }
      throw error
    }
  }

  private isFeeError(error: any): error is NetworkError {
    // The fee is insufficient for the transaction.
    return (error.response && error.response.data && error.response.data.extras 
      && error.response.data.extras.result_codes && 
      error.response.data.extras.result_codes.transaction == Horizon.HorizonApi.TransactionFailedResultCodes.TX_INSUFFICIENT_FEE)
  }

  private isNonRetryError(error: any): boolean {
    // Bad request, not found, too many requests.
    if (error.response && (error.response.status == 400 || error.response.status == 404 || error.response.status == 429)) {
      return true
    }
    return false
  }

  /**
   * Submit a transaction with exponential backoff network retry, starting at 200 ms 
   * by default.
   * @param transaction 
   * @param timeout 
   * @returns 
   */
  private async submitTransactionWithRetry(transaction: Transaction<Memo<MemoType>, Operation[]> | FeeBumpTransaction, timeout: number = 200): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    try {
      return await this.submitTransactionWithAccountLock(transaction)
    } catch (error) {
      if (this.isNonRetryError(error)) {
        throw this.getTransactionError(transaction, error)
      }
      
      await sleep(timeout)

      // Check that the transaction is not expired before sending it again.
      const inner = transaction instanceof FeeBumpTransaction ? transaction.innerTransaction : transaction
      const expiration = parseInt(inner.timeBounds?.maxTime ?? "0")

      if (Date.now() >= expiration * 1000) {
        throw transactionError("Transaction expired. Create a new one and submit it again.", {cause: error})
      }

      return await this.submitTransactionWithRetry(transaction, 2 * timeout)
    }
  }

  /**
   * Stellar does not allow to send two transactions from the same source account in the same ledger. This
   * method prevents this situation by enqueueing transactions with the same source account.
   * @param transaction 
   * @returns 
   */
  private async submitTransactionWithAccountLock(transaction: Transaction<Memo<MemoType>, Operation[]> | FeeBumpTransaction): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const key = (transaction instanceof FeeBumpTransaction) ? transaction.innerTransaction.source : transaction.source
    if (this.concurrentTransactions[key] !== undefined) {
      // There is already a transaction being processed for this account. Wait for it to finish and retry.
      logger.debug(`Waiting for transaction from ${key}`)
      try {
        await this.concurrentTransactions[key]
      } catch (error) {
        // Ignore error since it needs to be thrown only by the submitter code.
      }
      // Note that this "await" is the second one (or more) for this promise, the first one being the code that
      // releases the lock and will be the first to execute. This guarantees that the second transaction will
      // find the lock released.
      return await this.submitTransactionWithAccountLock(transaction)
    } else {
      try {
        // lock
        this.concurrentTransactions[key] = this.submitTransactionWithRateLimiting(transaction)
        logger.debug(`Submitting transaction from ${key}`)
        // operation
        const result = await this.concurrentTransactions[key]
        return result as Horizon.HorizonApi.SubmitTransactionResponse
      } finally {
        // release lock
        delete this.concurrentTransactions[key]  
      }
    }
  }
  // Limit the number of concurrent transactions to avoid overloading the network.
  async submitTransactionWithRateLimiting(transaction: Transaction<Memo<MemoType>, Operation[]> | FeeBumpTransaction): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    return await this.callServer(async (server) => await server.submitTransaction(transaction))
  }
  async loadAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    return await this.callServer(async (server) => await server.loadAccount(publicKey))
  }
  async callServer<T>(fn: (server: Horizon.Server) => Promise<T>) : Promise<T> {
    return await this.rateLimiter.run(async () => await fn(this.server))
  }
  getServerWithoutRateProtection() {
    return this.server
  }
  /**
   * Implements {@link Ledger#createCurrency}
   */
  async createCurrency(config: LedgerCurrencyConfig, sponsor: Keypair): Promise<LedgerCurrencyKeys> {
    // Generate the keys.
    const keys = {
      issuer: Keypair.random(),
      credit: Keypair.random(),
      admin: Keypair.random(),
      externalIssuer: Keypair.random(),
      externalTrader: Keypair.random(),
    }

    const data = {
      issuerPublicKey: keys.issuer.publicKey(),
      creditPublicKey: keys.credit.publicKey(),
      adminPublicKey: keys.admin.publicKey(),
      externalIssuerPublicKey: keys.externalIssuer.publicKey(),
      externalTraderPublicKey: keys.externalTrader.publicKey(),
    }

    const currency = new StellarCurrency(this, config, data)
    
    await currency.install({
      sponsor,
      admin: keys.admin,
      credit: keys.credit,
      issuer: keys.issuer,
      externalIssuer: keys.externalIssuer,
      externalTrader: keys.externalTrader,
    })

    logger.info({publicKeys: data}, `Created new currency ${config.code}`)

    return keys
  }
  /**
   * Implements {@link Ledger#getCurrency}
   */
  getCurrency(config: LedgerCurrencyConfig, data: LedgerCurrencyData, state?: LedgerCurrencyState): StellarCurrency {
    if (!this.currencies[data.issuerPublicKey]) {
      this.currencies[data.issuerPublicKey] = new StellarCurrency(this, config, data, state)
      this.currencies[data.issuerPublicKey].start()
    }
    return this.currencies[data.issuerPublicKey]
  }

  private getTransactionError(transaction: Transaction<Memo<MemoType>, Operation[]> | FeeBumpTransaction, error: any): KError {
    const inner = transaction instanceof FeeBumpTransaction ? transaction.innerTransaction : transaction
    const operations = inner.operations.map(op => op.type)
    if (error.response && error.response.data) {
      const msg = `Horizon Error: ${error.response.data.title}`
      const data = error.response.data as Horizon.HorizonApi.ErrorResponseData
      if (data.status === 429) { // Too many requests 1
        if (error.response.headers) {
          const {"x-ratelimit-limit": limit, "x-ratelimit-reset": reset} = error.response.headers
          return internalError(msg, {details: {limit, reset, operations, data}, cause: error})
        } else {
          return internalError(msg, {details: {operations, data}, cause: error})
        }
      } else if (data.status === 400 && data.extras) {
        // Transaction failed
        const result = data.extras.result_codes as {
          transaction: string;
          operations?: string[];
          inner_transaction?: string;
        };
        return transactionError(msg, {details: {operations, results: result.operations, result: result.transaction, inner: result.inner_transaction}, cause: error})
      } else {
        // Other Horizon error
        return transactionError(msg, {details: {operations, data}, cause: error})
      }
    } else if (error instanceof Error) {
      return internalError(`Error submitting transaction: ${error.message}`, {details: {operations}, cause: error})
    } else {
      return internalError(`Error submitting transaction: ${error}`, {details: {operations}, cause: error})
    }
  }
}