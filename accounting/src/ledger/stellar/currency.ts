import { Asset, Operation, AuthRequiredFlag, AuthRevocableFlag, AuthClawbackEnabledFlag, AuthFlag, TransactionBuilder, Keypair, Horizon } from "@stellar/stellar-sdk"
import { LedgerCurrency, LedgerCurrencyConfig, LedgerCurrencyData, LedgerCurrencyState, LedgerExternalTransfer, LedgerTransfer, PathQuote } from "../ledger"
import { StellarAccount } from "./account"
import { StellarLedger } from "./ledger"
import Big from "big.js"
import { logger } from "src/utils/logger"
import { retry, sleep } from "src/utils/sleep"
import { badRequest, internalError, notFound } from "src/utils/error"
import { CallBuilder } from "@stellar/stellar-sdk/lib/horizon/call_builder"

interface StreamData {
  started: boolean
  listen?: () => void
  close?: () => void
}
const STREAM_NAMES = [ "externalTrades" ] as const
type StreamName = typeof STREAM_NAMES[number]

const pathPaymentToTransfer = (pathPayment: Horizon.HorizonApi.PathPaymentOperationResponse): LedgerExternalTransfer => ({
  ...paymentToTransfer(pathPayment),
  sourceAmount: pathPayment.source_amount,
  sourceAsset: new Asset(pathPayment.source_asset_code as string, pathPayment.source_asset_issuer),
})

// Type modification so we can use the same function for both path and simple payments.
const paymentToTransfer = (payment: Omit<Horizon.HorizonApi.PaymentOperationResponse, "type" | "type_i">): LedgerTransfer => ({
  payer: payment.from,
  payee: payment.to,
  amount: payment.amount,
  asset: new Asset(payment.asset_code as string, payment.asset_issuer),
  hash: payment.transaction_hash
})

export class StellarCurrency implements LedgerCurrency {
  static GLOBAL_ASSET_CODE = "HOUR"
  /**
   * In case there is no defined maximum balance for the external trader account,
   * this is the default for the initial balance in hours for this account.
   */
  static DEFAULT_EXTERNAL_TRADER_INITIAL_CREDIT = "1000"

  ledger: StellarLedger
  config: LedgerCurrencyConfig
  data: LedgerCurrencyData
  state: LedgerCurrencyState

  // Registry of currency accounts. This way we are sure we are not instantiating
  // the same account twice and hence we won't have seq number issues.
  // NOTE: We could use a map of WeakRef's and FinalizationRegistry to optimize the
  // memory usage:
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management#weakrefs_and_finalizationregistry
  private accounts: Record<string, StellarAccount>

  // Stream handlers. It has been architectured so it allows for a set of different
  // streams but currently only the externalTrades stream is implemented. This is
  // because we expected to be able to stream all payments associated with a single
  // asset but it looks like that's not the case.
  private streams: Record<StreamName, StreamData>

  constructor(ledger: StellarLedger, config: LedgerCurrencyConfig, data: LedgerCurrencyData, state?: LedgerCurrencyState) {
    this.ledger = ledger

    this.config = config
    this.data = data
    this.state = state ?? {externalTradesStreamCursor: "0"}
    this.accounts = {}
    
    this.streams = Object.fromEntries(STREAM_NAMES.map((name) => [name, {started: false}])) as Record<StreamName, StreamData>

    // Input checking.
    if (this.config.code.match(/^[A-Z0-9]{4}$/) === null) {
      throw badRequest("Invalid currency code")
    }
  }
  
  private listenStream<T extends Horizon.HorizonApi.BaseResponse & {paging_token: string}>(name: StreamName , cursor: keyof LedgerCurrencyState, endpoint: CallBuilder<Horizon.ServerApi.CollectionPage<T>>, onMessage: (record: T) => Promise<void>) {
    const separationAttempt = 5000
    
    const stream = this.streams[name]
    stream.started = true

    stream.listen = () => {
      if (!stream.started) { return }

      const lastAttempt = Date.now()
      stream.close = endpoint.cursor(this.state[cursor]).stream({
        onmessage: (page: Horizon.ServerApi.CollectionPage<T>) => {
          // Looks like there is a bug in typings, as the records received when steraming are not
          // of type collection but single resources.
          const record = page as unknown as T
          logger.debug({page}, `Received Horizon stream event.`)
          onMessage(record)
          .catch((error) => {
            this.ledger.emitter.emit("error", error)
          })
          .finally(() => {
            // Update cursor in db.
            this.state[cursor] = record.paging_token
            this.ledger.emitter.emit("stateUpdated", this, this.state)
          })
        },
        onerror: (error: any) => {
          // "throw" error
          this.ledger.emitter.emit("error", error)
          // Close stream
          if (stream.close) {
            stream.close()
          }
          const fromLastAttempt = Date.now() - lastAttempt
          const wait = Math.max(0, separationAttempt - fromLastAttempt)
          sleep(wait).then(stream.listen).catch((error) => {
            this.ledger.emitter.emit("error", error)
          })
        },
        reconnectTimeout: 5*60*1000 // 5 min
      })
    }

    stream.listen()
  }
  start() {  
    this.listenStream("externalTrades", "externalTradesStreamCursor", 
      this.ledger.getServerWithoutRateProtection().trades().forAccount(this.data.externalTraderPublicKey),
      (trade) => this.handleExternalTradeEvent(trade)
    )
    // TODO: Listen for local payments too.
  }

  public stop() {
    for (const name of STREAM_NAMES) {
      this.closeStream(name)
    }
  }

  private closeStream(name: StreamName) {
    const stream = this.streams[name]
    if (stream.close) {
      stream.close()
      stream.close = undefined
      stream.started = false
    }
  }

  private async handleExternalTradeEvent(trade: Horizon.ServerApi.TradeRecord) {
    // We want to monitor incomming payments using this external trader.
    // An incoming payment is Hx => Ht => Lt, where:
    // - Hx is the external Hour
    // - Ht is the local Hour
    // - Lt is the local currency
    
    // We want to catch the Hx => Ht (selling local hours by external hours)
    // trade if it is done by this external trader.
    if (trade.base_asset_type == "native" || trade.counter_asset_type == "native") {
      throw internalError("Unexpected trade with native token", {details: trade})
    }
    const base = new Asset(trade.base_asset_code as string, trade.base_asset_issuer)
    const counter = new Asset(trade.counter_asset_code as string, trade.counter_asset_issuer)
    const hour = this.hour()
    const asset = this.asset()

    const tradeToTransfer = async (trade: Horizon.ServerApi.TradeRecord): Promise<LedgerTransfer> => {
      const operation = await trade.operation()
      return pathPaymentToTransfer(operation as Horizon.ServerApi.PathPaymentOperationRecord)
    }

    if (trade.base_is_seller // Selling
      && base.equals(hour) // this HOUR
      && counter.code == StellarCurrency.GLOBAL_ASSET_CODE // by external HOUR
    ) {
      // Create a market order that will either immediately execute to compensate 
      // the trade balance or will be appended to the order book to be executed in
      // a later outgoing external payment.
      this.ledger.emitter.emit("incommingHourTrade", this, {
        externalHour: counter
      })
    } else if (!trade.base_is_seller // Buying
      && base.code == StellarCurrency.GLOBAL_ASSET_CODE // external HOUR
      && counter.equals(hour)) { // by this HOUR
      this.ledger.emitter.emit("incommingHourTrade", this, {
        externalHour: base
      })
    } else if (base.equals(asset) && counter.equals(hour)) {
      if (trade.base_is_seller) {
        // selling local by hours, so this is an incomming payment.
        this.ledger.emitter.emit("incommingTransfer", this, await tradeToTransfer(trade))
      } else {
        this.ledger.emitter.emit("outgoingTransfer", this, await tradeToTransfer(trade))
      }
    } else if (base.equals(hour) && counter.equals(asset)) {
      if (trade.base_is_seller) {
        // selling hours by local, so this is an outgoing payment.
        this.ledger.emitter.emit("outgoingTransfer", this, await tradeToTransfer(trade))
      } else {
        this.ledger.emitter.emit("incommingTransfer", this, await tradeToTransfer(trade))
      }
    } else {
      throw internalError("Unexpected trade", {details: trade})
    }
  }

  /**
   * Get an offer from the trader account selling the given asset and buying hours.
   */
  private async fetchExternalOffer(selling: Asset, buying: Asset) {
    const offers = await this.ledger.callServer((server) =>
      server.offers()
        .seller(this.data.externalTraderPublicKey)
        .selling(selling)
        .buying(buying)
        .limit(1).call()
    )
    if (offers.records.length > 0) {
      return offers.records[0]
    } else {
      return false
    }
  }

  /**
   * This function checks the offer from the external trader account that is selling the given asset
   * and updates this offer so the total offered equals the current balance.
   */
  async updateExternalOffer(asset: Asset, keys: {sponsor: Keypair, externalTrader: Keypair})  {
    const offer = await this.fetchExternalOffer(asset, this.hour())
    const trader = await this.externalTraderAccount()
    const balance = trader.balance(asset)

    const builder = this.ledger.transactionBuilder(trader)
    const sellOfferOptions = {
      source: this.data.externalTraderPublicKey,
      selling: asset,
      buying: this.hour(),
      amount: balance.toString(),
      price: asset.equals(this.asset()) ? this.config.rate : "1"
    }

    if (offer) {
      // Offer already exists, just update it.
      builder.addOperation(Operation.manageSellOffer({
        ...sellOfferOptions,
        offerId: offer.id
      }))
      await this.ledger.submitTransaction(builder, [keys.externalTrader], keys.sponsor)
      logger.info({asset}, `Updated external ${asset.code} offer for currency ${this.config.code}`)
    } else {
      // Create new offer.
      builder.addOperation(Operation.beginSponsoringFutureReserves({
        source: keys.sponsor.publicKey(),
        sponsoredId: this.data.externalTraderPublicKey
      }))
      .addOperation(Operation.createPassiveSellOffer(sellOfferOptions))
      .addOperation(Operation.endSponsoringFutureReserves({
        source: this.data.externalTraderPublicKey
      }))

      await this.ledger.submitTransaction(builder, [keys.sponsor, keys.externalTrader], keys.sponsor)
      logger.info({asset}, `Created external ${asset.code} offer for currency ${this.config.code}`)
    }
    this.ledger.emitter.emit("externalOfferUpdated", this, {...sellOfferOptions, created: !offer})
  }

  /**
   * Get the Stellar asset object for this currency.
   * @returns The asset.
   */
  asset(): Asset {
    return new Asset(this.config.code, this.data.issuerPublicKey)
  }

  /**
   * Get the Stellar asset object for the global "HOUR" asset.
   * @returns The asset.
   */
  hour(): Asset {
    return new Asset(StellarCurrency.GLOBAL_ASSET_CODE, this.data.externalIssuerPublicKey)
  }

  /**
   * Load the issuer account
   * @returns The issuer account for this currency.
   */
  async issuerAccount() {
    return this.getAccount(this.data.issuerPublicKey)
  }

  /**
   * Load the credit account
   * @returns The credit account for this currency.
   */
  async creditAccount() {
    return this.getAccount(this.data.creditPublicKey)
  }

  async externalTraderAccount() {
    return this.getAccount(this.data.externalTraderPublicKey)
  }

  async externalIssuerAccount() {
    return this.getAccount(this.data.externalIssuerPublicKey)
  }

  /**
   * Create the necessary accounts and trustlines for the currency in the Stellar network, including
   * the infrastructure for external trading.
   * @param keys 
   */
  async install(keys: {
    sponsor: Keypair // For paying the fee, for sponsoring reserves and as sourcve account for the transaction.
    issuer: Keypair,  // 
    credit: Keypair,
    admin: Keypair,
    externalIssuer: Keypair,
    externalTrader: Keypair
  }) {
    const builder = this.ledger.sponsorTransactionBuilder()
    this.installLocalTransaction(builder)
    this.installExternalTransaction(builder)

    const signers = Object.values(keys)

    return await this.ledger.submitTransaction(builder, signers, keys.sponsor)
  }


  /**
   * Create the necessary accounts and trustlines for the currency in the Stellar network.
   * Only the local model is created.
   * @param keys 
   */
  private installLocalTransaction(builder: TransactionBuilder) {
    const sponsorPublicKey = this.ledger.sponsorPublicKey.publicKey()
    builder
      // 1. Issuer.
      .addOperation(Operation.beginSponsoringFutureReserves({
        source: sponsorPublicKey,
        sponsoredId: this.data.issuerPublicKey
      }))
      // 1.1 Create account
      .addOperation(Operation.createAccount({
        destination: this.data.issuerPublicKey,
        startingBalance: "0"
      }))
      // 1.2. Set flags to control the asset:
      //   - AuthRequiredFlag: Trustlines from user accounts to this asset need to be explicitly authorized by the issuer.
      //   - AuthRevocableFlag: Trustlines can be revoked by the issuer, thus freezing the asset in user account.
      //   - AuthClawbackEnabledFlag: Issuer can remove a portion or all the asset from a user account.
      .addOperation(Operation.setOptions({
        source: this.data.issuerPublicKey,
        setFlags: (AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag) as AuthFlag,
        homeDomain: this.ledger.domain
      }))
      .addOperation(Operation.endSponsoringFutureReserves({
        source: this.data.issuerPublicKey
      }))
      
    // 2. Credit account.
    this.createAccountTransaction(builder, {
      publicKey: this.data.creditPublicKey,
      maximumBalance: undefined
    })
    // 2.1 Initially fund credit account
    builder.addOperation(Operation.payment({
      source: this.data.issuerPublicKey,
      destination: this.data.creditPublicKey,
      asset: this.asset(),
      amount: this.creditAccountStartingBalance()
    }))

    // 3. Admin account
    this.createAccountTransaction(builder, {
      publicKey: this.data.adminPublicKey,
      maximumBalance: undefined
    })
    
  }

  /**
   * Creates the necessary accounts and trustlines for the currency to be able to exchange with 
   * other komunitin currencies in the Stellar network.
   * 
   * Give the credit key only if this.config.externalTraderInitialCredit is not zero.
   * @param keys 
   */
  installExternalTransaction(builder: TransactionBuilder) {
    const sponsorPublicKey = this.ledger.sponsorPublicKey.publicKey()
    
    // 1. Create external issuer.
    // Not using the createAccountTransaction because this account does not have local currency.
    builder.addOperation(Operation.beginSponsoringFutureReserves({
      source: sponsorPublicKey,
      sponsoredId: this.data.externalIssuerPublicKey
    }))
    // 1.1 Create account
    .addOperation(Operation.createAccount({
      source: this.data.issuerPublicKey,
      destination: this.data.externalIssuerPublicKey,
      startingBalance: "0"
    }))
    // 1.2. Set homeDomain
    .addOperation(Operation.setOptions({
      source: this.data.externalIssuerPublicKey,
      homeDomain: this.ledger.domain,
    }))
    .addOperation(Operation.endSponsoringFutureReserves({
      source: this.data.externalIssuerPublicKey
    }))
    // 2.0 Create external trader with local currency balance.
    this.createAccountTransaction(builder, {
      publicKey: this.data.externalTraderPublicKey,
      maximumBalance: this.config.externalTraderMaximumBalance
    })
    if (this.config.externalTraderInitialCredit) {
      this.addCreditTransaction(builder, this.data.externalTraderPublicKey, this.config.externalTraderInitialCredit,this.creditAccountStartingBalance())
    }

    // Add additional properties to external trader.
    builder.addOperation(Operation.beginSponsoringFutureReserves({
      source: sponsorPublicKey,
      sponsoredId: this.data.externalTraderPublicKey
    }))
    // 2.1 Create unlimited trustline to hours.
    .addOperation(Operation.changeTrust({
      source: this.data.externalTraderPublicKey,
      asset: this.hour(),
    }))
    // 2.2 Add initial hours balance to external trader.
    const hoursBalance = this.externalTraderStartingHoursBalance()
    if (Big(hoursBalance).gt(0)) {
      builder.addOperation(Operation.payment({
        source: this.data.externalIssuerPublicKey,
        destination: this.data.externalTraderPublicKey,
        asset: this.hour(),
        amount: hoursBalance
      }))
    }
    // 2.3 Add passive sell offer for incomming payments (hour => asset).
    if (this.config.externalTraderInitialCredit && Big(this.config.externalTraderInitialCredit).gt(0)) {
      builder.addOperation(Operation.createPassiveSellOffer({
        source: this.data.externalTraderPublicKey,
        selling: this.asset(),
        buying: this.hour(),
        amount: this.config.externalTraderInitialCredit,
        price: this.config.rate
      }))
    }
    // 2.4 Add passive sell offer for outgoing payments (asset => hour).
    if (Big(hoursBalance).gt(0)) {
      builder.addOperation(Operation.createPassiveSellOffer({
        source: this.data.externalTraderPublicKey,
        selling: this.hour(),
        buying: this.asset(),
        amount: hoursBalance,
        price: {n: this.config.rate.d, d: this.config.rate.n}
      }))
    }
    builder.addOperation(Operation.endSponsoringFutureReserves({
      source: this.data.externalTraderPublicKey
    }))

  }

  /**
   * Ensures that the external trader account has sufficient hours, and transfers more from
   * the external issuer if needed.
   * 
   * This function assures that the current balance of the external trader is not less than
   * the starting balance. This starting balance is computed as follows:
   *  - If externalTraderMaximumBalance is defined, it is the difference between this value and
   *   the externalTraderInitialCredit expressed in hours. Since hours are needed in exchange
   *   for local currency.
   * - If externalTraderMaximumBalance is not defined, the starting balance is just the 
   *   constant {@link StellarCurrency.DEFAULT_EXTERNAL_TRADER_INITIAL_CREDIT}.
   */
  public async fundExternalTrader(keys: {
    sponsor: Keypair,
    externalIssuer: Keypair,
  }) {
    
    const starting = this.externalTraderStartingHoursBalance()

    const trader = await this.externalTraderAccount()
    const balance = Big(trader.balance())
    
    if (balance.lt(starting)) {
      const amount = Big(starting).minus(balance).toString()
      const external = await this.externalIssuerAccount()
      const builder = this.ledger.transactionBuilder(external)
        .addOperation(Operation.payment({
          source: this.data.externalIssuerPublicKey,
          destination: this.data.externalTraderPublicKey,
          asset: this.hour(),
          amount
        }))
      return await this.ledger.submitTransaction(builder, [keys.externalIssuer], keys.sponsor)
    }
    return false
  }

  private externalTraderStartingHoursBalance(): string {
    // TODO: take in count trusted currencies.
    if (this.config.externalTraderMaximumBalance) {
      return this.fromLocalToHour(
        Big(this.config.externalTraderMaximumBalance)
        .minus(this.config.externalTraderInitialCredit ?? 0)
        .toString())
    } else {
      return StellarCurrency.DEFAULT_EXTERNAL_TRADER_INITIAL_CREDIT
    }
  }

  /**
   * Adds an operation to the given TransactionBuilder to ensure the credit account has at
   * least the minAmount in balance. Otherwise, it adds a multiple of the return value of
   * {@link creditAccountStartingBalance}.
   * 
   * @param builder 
   * @param minAmount 
   * @returns 
   */
  fundCreditAccountTransaction(builder: TransactionBuilder, creditAccountBalance: string, minAmount: string|undefined): {issuer: boolean} {
    const balance = Big(creditAccountBalance)

    // If minAmount is not defined, we use the default starting balance.
    const starting = Big(this.creditAccountStartingBalance())
    const minBalance = minAmount ? Big(minAmount) : starting
    const diff = minBalance.minus(balance)

    if (diff.gt(0)) {
      // In this case we need to transfer more funds from the issuer account.
      // We won't just transfer the difference, but we will transfer a multiple 
      // of the starting balance.
      const amount = diff.div(starting).round(0, Big.roundUp).times(starting).toString()
      const asset = this.asset()
      builder.addOperation(Operation.payment({
        source: this.data.issuerPublicKey,
        destination: this.data.creditPublicKey,
        asset: this.asset(),
        amount
      }))
      logger.info(`Funding the credit account with ${asset.code} ${amount}`)
      return {issuer: true}
    }
    return {issuer: false}
  }

  // Return the balance that the credit account should have so it can continue its operation for 
  // some time. Before we need to fund it again.
  // At this time this is arbitrarily set to 1000 hours.
  private creditAccountStartingBalance(): string {
    return this.fromHourToLocal("1000")
  }

  /**
   * Adds the necessary operations to t to create a new account with a trustline to this local currency 
   * with limit config.maximumBalance and optionally an initial payment of config.initialCredit from 
   * the credit account. Note that this transaction will need to be signed by the sponsor, the new account,
   * the issuer and optionally the credit account if config.initialCredit > 0.
   * 
   * You may want to call {@link addCreditTransaction} to give some credit to the account.
   * 
   * @param t The transaction builder.
   * @param config Account parameters.
   */
  private createAccountTransaction(t: TransactionBuilder, config: {publicKey: string, maximumBalance?: string, adminSigner?: string}) {
    const sponsorPublicKey = this.ledger.sponsorPublicKey.publicKey()
    const asset = this.asset()

    t.addOperation(Operation.beginSponsoringFutureReserves({
      source: sponsorPublicKey,
      sponsoredId: config.publicKey
    }))
      // Create account
      .addOperation(Operation.createAccount({
        destination: config.publicKey,
        startingBalance: "0"
      }))
      // Create trust line
      .addOperation(Operation.changeTrust({
        source: config.publicKey,
        asset,
        limit: config.maximumBalance
      }))
      // Aprove trust line
      .addOperation(Operation.setTrustLineFlags({
        source: this.data.issuerPublicKey,
        asset,
        trustor: config.publicKey,
        flags: {
          authorized: true,
        }
      }))
    // Add the admin as a signer, and set the account thresholds so that both the account key
    // and the admin key can sign payments, but only the admin can perform administrative 
    // operations such as change the signers or delete the account.
    if (config.adminSigner) {
      t.addOperation(Operation.setOptions({
        source: config.publicKey,
        signer: {
          ed25519PublicKey: config.adminSigner,
          weight: 2
        }
      }))
      .addOperation(Operation.setOptions({
        source: config.publicKey,
        masterWeight: 1,
        lowThreshold: 1,
        medThreshold: 1,
        highThreshold: 2
      }))
    }

    t.addOperation(Operation.endSponsoringFutureReserves({
      source: config.publicKey
    }))
  }

  addCreditTransaction(t: TransactionBuilder, publicKey: string, credit: string, creditAccountBalance: string): {issuer: boolean, credit: boolean} {
    if (Big(credit).gt(0)) {
      const {issuer} = this.fundCreditAccountTransaction(t, creditAccountBalance, credit)
      
      const asset = this.asset()
      t.addOperation(Operation.payment({
        source: this.data.creditPublicKey,
        destination: publicKey,
        asset,
        amount: credit
      }))
      return {
        issuer,
        credit: true
      }
    }
    return {
      issuer: false,
      credit: false
    }
  }
  /**
   * Implements {@link LedgerCurrency.createAccount()}
   */
  async createAccount(options: {
    initialCredit: string,
    maximumBalance?: string,
  }, keys: {
    sponsor: Keypair
    issuer: Keypair,
    credit?: Keypair, // Only if defaultInitialCredit > 0
  }): Promise<{key: Keypair}> {
    if (keys.credit && Big(options.initialCredit).eq(0)) {
      throw internalError("Credit key not allowed if initialCredit is 0")
    }
    if (!keys.credit && Big(options.initialCredit).gt(0)) {
      throw internalError("Credit key required if initialCredit is positive")
    }
    // Create keypair.
    const account = Keypair.random()
    const issuerAccount = await this.issuerAccount()
    const builder = this.ledger.transactionBuilder(issuerAccount)

    this.createAccountTransaction(builder, {
      publicKey: account.publicKey(),
      maximumBalance: options.maximumBalance,
      adminSigner: this.data.adminPublicKey
    })
    const creditAccount = await this.creditAccount()
    this.addCreditTransaction(builder, account.publicKey(), options.initialCredit, creditAccount.balance())
    // array of keys discarding undefineds.
    const givenKeys = Object.values(keys).filter(Boolean)
    await this.ledger.submitTransaction(builder, [...givenKeys, account], keys.sponsor)

    logger.info({publicKey: account.publicKey()}, `Created new account for currency ${this.config.code}`)

    return {key: account}
  }
  /**
   * Implements {@link LedgerCurrency.getAccount}. 
   * 
   * This function always makes a call to the ledger to get the latest information about the account.
   * 
   */
  async getAccount(publicKey: string): Promise<StellarAccount> {
    
    if (!this.accounts[publicKey]) {
      this.accounts[publicKey] = new StellarAccount(publicKey, this)
    }

    await this.accounts[publicKey].update()

    return this.accounts[publicKey]
  }

  /**
   * Convert an amount in local currency to hours with 7 digits of precision.
   * @param amountInLocal The amount in local currency.
   * @returns The amount in hours.
   */
  fromLocalToHour(amountInLocal: string): string {
    return Big(amountInLocal).times(this.config.rate.n).div(this.config.rate.d).toFixed(7)
  }

  /**
   * Convert an amount in hours to local currency truncating to 7 digits of precision.
   * @param amountInHours The amount in hours.
   * @returns The amount in local currency.
   */
  fromHourToLocal(amountInHours: string): string {
    return Big(amountInHours).times(this.config.rate.d).div(this.config.rate.n).toFixed(7, Big.roundDown)
  }

  /**
   * Implements {@link LedgerCurrency.trustCurrency}.
   */
  async trustCurrency(line: { trustedPublicKey: string, limit: string }, keys: { sponsor: Keypair, externalTrader: Keypair, externalIssuer?: Keypair }) {
    const asset = new Asset(StellarCurrency.GLOBAL_ASSET_CODE, line.trustedPublicKey)
    const limit = this.fromLocalToHour(line.limit)
    
    const externalTrader = await this.externalTraderAccount()
    
    // Check if there is an existing selling offer for this trustline.
    const trustline = externalTrader.balances().find((b) => b.asset.equals(asset))

    if (Big(limit).lt(trustline?.balance ?? 0)) {
      throw badRequest(`Trust limit ${limit} is less than current balance.`)
    }

    if (trustline && Big(trustline.limit).eq(limit)) {
      // We're already trusting the external currency with the correct limit.
      logger.info({line}, `Currency ${this.config.code} already trusting ${asset.code} with limit ${limit}`)
      return
    }

    const builder = this.ledger.transactionBuilder(externalTrader)
    const signers = [keys.externalTrader]

    const changeTrustOp = Operation.changeTrust({
      source: this.data.externalTraderPublicKey,
      asset,
      limit
    })
    const offerOptions = {
      source: this.data.externalTraderPublicKey,
      selling: this.hour(),
      buying: asset,
      amount: Big(limit).minus(trustline?.balance ?? 0).toString(),
      price: "1"
    }

    if (trustline === undefined) {
      if (!keys.externalIssuer) {
        throw internalError("Missing external issuer key.")
      }
      // Case 1: We're creating a new trustline
      // 1.1 Sponsor the trustline and the offer.
      builder.addOperation(Operation.beginSponsoringFutureReserves({
        source: keys.sponsor.publicKey(),
        sponsoredId: this.data.externalTraderPublicKey
      }))
      // 1.2 Create trustline
      builder.addOperation(changeTrustOp)
      // 1.3 Fund account for the offer
      .addOperation(Operation.payment({
        source: this.data.externalIssuerPublicKey,
        destination: this.data.externalTraderPublicKey,
        asset: this.hour(),
        amount: limit
      }))
      // 1.4 Create offer
      .addOperation(Operation.createPassiveSellOffer(offerOptions))
      // 1.5 End sponsoring
      .addOperation(Operation.endSponsoringFutureReserves({
        source: this.data.externalTraderPublicKey
      }))
      signers.push(keys.sponsor, keys.externalIssuer)
    } else {
      const offer = await this.fetchExternalOffer(this.hour(), asset)
      if (!offer) {
        // We could heal the system here.
        throw internalError(`Expecting sell offer for existing trustline in currency ${asset.code}.`, {details: trustline})
      }
      const offerOp = Operation.manageSellOffer({
        ...offerOptions,
        offerId: offer.id,
      })
      if (Big(limit).gt(trustline.limit)) {
        if (!keys.externalIssuer) {
          throw internalError("Missing external issuer key.")
        }
        // Case 2: We're increasing the trustline limit
        // 2.1 Update trustline
        builder.addOperation(changeTrustOp)
        // 2.2 Increase hours balance to satisfy the new offer
        .addOperation(Operation.payment({
          source: this.data.externalIssuerPublicKey,
          destination: this.data.externalTraderPublicKey,
          asset: this.hour(),
          amount: Big(limit).minus(trustline.limit).toString()
        }))
        // 2.3 Update offer
        .addOperation(offerOp)
        signers.push(keys.externalIssuer)
      } else {
        // Case 3: We're reducing the trustline limit
        // 3.1 Update offer
        builder.addOperation(offerOp)
        // 3.2 Decrease hours balance
        .addOperation(Operation.payment({
          source: this.data.externalTraderPublicKey,
          destination: this.data.externalIssuerPublicKey,
          asset: this.hour(),
          amount: Big(trustline.limit).minus(limit).toString()
        }))
        // 3.3 Update trustline
        .addOperation(changeTrustOp)
      }
    }
    await this.ledger.submitTransaction(builder, signers, keys.sponsor)

    logger.info({line}, `Currency ${this.config.code} trusted ${asset.code} with limit ${limit}`)
  }

  /**
   * Implements {@link LedgerCurrency.quotePath}, adding additional asset properties to the result.
   */
  async quotePath(data: {destCode: string, destIssuer: string, amount: string, retry?: boolean}): Promise<false | PathQuote>{
    const destAsset = new Asset(data.destCode, data.destIssuer)
    const noPathFound = new Error("No viable path found")
    const fn = async () => {
      
      logger.debug(`source_assets=${this.asset().code}:${this.asset().issuer}&destination_asset_type=credit_alphanum4&destination_asset_code=${destAsset.code}&destination_asset_issuer=${destAsset.issuer}&destination_amount=${data.amount}`)
      
      const paths = await this.ledger.callServer((server) =>
        server.strictReceivePaths(
          [this.asset()],
          destAsset,
          data.amount
        ).call()
      )

      // Filter out paths that are not sneding the required amount.
      const viable = paths.records.filter((p) => Big(p.destination_amount).gte(data.amount))

      if (viable.length > 0) {
        // Get the path with minimum source amount.
        const path = viable.reduce((acc, p) => (Big(p.source_amount).lt(acc.source_amount)) ? p : acc)
        return {
          sourceAmount: path.source_amount,
          sourceAsset: this.asset(),
          destAmount: path.destination_amount,
          destAsset,
          path: path.path.map((a) => new Asset(a.asset_code, a.asset_issuer))
        }
      } else {
        throw noPathFound
      }
    }

    try {
      if (data.retry) {
        return await retry(fn, 30000, 1000)
      } else {
        return await fn()
      }
    } catch (error) {
      if (error === noPathFound) {
        return false
      } else {
        throw error
      }
    }
  }

  /**
   * Fetch a transfer from the ledger.
   */
  async getTransfer(hash: string): Promise<LedgerTransfer|LedgerExternalTransfer> {
    const transaction = await this.ledger.callServer((server) => server.transactions().transaction(hash).call())
    
    if (!transaction) {
      throw notFound(`Transaction ${hash} not found`)
    }
    const operations = await transaction.operations({limit: 100})
    const payment = operations.records.find((op) => [
      Horizon.HorizonApi.OperationResponseType.payment, 
      Horizon.HorizonApi.OperationResponseType.pathPayment
    ].includes(op.type))

    if (!payment) {
      throw badRequest(`No payment operation found in transaction ${hash}`)
    }

    const transfer = payment.type === Horizon.HorizonApi.OperationResponseType.payment
      ? paymentToTransfer(payment)
      : pathPaymentToTransfer(payment as Horizon.HorizonApi.PathPaymentOperationResponse)
    
    return transfer
  }

}
