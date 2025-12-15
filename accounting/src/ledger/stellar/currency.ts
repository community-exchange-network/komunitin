import { Asset, AuthClawbackEnabledFlag, AuthFlag, AuthRequiredFlag, AuthRevocableFlag, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk"
import { CallBuilder } from "@stellar/stellar-sdk/lib/horizon/call_builder"
import { OfferAsset } from "@stellar/stellar-sdk/lib/horizon/types/offer"
import Big from "big.js"
import { badRequest, internalError, notFound } from "src/utils/error"
import { logger } from "src/utils/logger"
import { retry, sleep } from "src/utils/sleep"
import { Rate } from "../../utils/types"
import { ExternalBalance, ExternalTrustline, KeyPair, LedgerCurrency, LedgerCurrencyConfig, LedgerCurrencyData, LedgerCurrencyState, LedgerExternalTransfer, LedgerTransfer, PathQuote } from "../ledger"
import { StellarAccount } from "./account"
import { StellarLedger } from "./ledger"
import { HorizonApi } from "@stellar/stellar-sdk/lib/horizon"

interface StreamData {
  started: boolean
  listen?: () => void
  close?: () => void
}
const STREAM_NAMES = ["externalTrades"] as const
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

// This is the actual value that the Stellar SDK sets for a trustline with undefined limit.
const UNDEFINED_TRUSTLINE_LIMIT = Big('9223372036854775807').div(10**7)

export class StellarCurrency implements LedgerCurrency {
  static GLOBAL_ASSET_CODE = "HOUR"

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
    this.state = state ?? { externalTradesStreamCursor: "0" }
    this.accounts = {}

    this.streams = Object.fromEntries(STREAM_NAMES.map((name) => [name, { started: false }])) as Record<StreamName, StreamData>

    // Input checking.
    if (this.config.code.match(/^[A-Z0-9]{4}$/) === null) {
      throw badRequest("Invalid currency code")
    }
  }


  setData(data: LedgerCurrencyData) {
    this.data = data
  }
  setConfig(config: LedgerCurrencyConfig) {
    this.config = config
  }

  private listenStream<T extends Horizon.HorizonApi.BaseResponse & { paging_token: string }>(name: StreamName, cursor: keyof LedgerCurrencyState, endpoint: CallBuilder<Horizon.ServerApi.CollectionPage<T>>, onMessage: (record: T) => Promise<void>) {
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
          logger.debug({ page }, `Received Horizon stream event.`)
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
        reconnectTimeout: 5 * 60 * 1000 // 5 min
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
      throw internalError("Unexpected trade with native token", { details: trade })
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
      throw internalError("Unexpected trade", { details: trade })
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

  private async fetchExternalOffers() {
    const offers = await this.ledger.callServer((server) =>
      server.offers()
        .seller(this.data.externalTraderPublicKey)
        .limit(200).call()
    )
    return offers.records
  }

  /**
   * This function checks the offer from the external trader account that is selling the given asset
   * and updates this offer so the total offered equals the current balance.
   */
  async updateExternalOffer(asset: Asset, keys: { sponsor: Keypair, externalTrader: Keypair }, amount?: string) {
    const offer = await this.fetchExternalOffer(asset, this.hour())
    const trader = await this.externalTraderAccount()
    const balance = trader.balance(asset)
    
    const existingOfferAmount = offer ? offer.amount : "0"
    const newOfferAmount = amount ?? balance

    if (Big(existingOfferAmount).eq(Big(newOfferAmount))) {
      logger.debug({ asset }, `External offer selling ${asset.code} for currency ${this.config.code} is already up to date.`)
      return
    }

    const builder = this.ledger.transactionBuilder(trader)
    const sellOfferOptions = {
      source: this.data.externalTraderPublicKey,
      selling: asset,
      buying: this.hour(),
      amount: newOfferAmount,
      price: asset.equals(this.asset()) ? this.config.rate : "1"
    }
    const signers = [keys.externalTrader]
    if (offer) {
      // Offer already exists, just update it.
      builder.addOperation(Operation.manageSellOffer({
        ...sellOfferOptions,
        offerId: offer.id
      }))
      
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

      signers.push(keys.sponsor)
    }
    await this.ledger.submitTransaction(builder, signers, keys.sponsor)
    logger.info({ asset }, `Updated external offer selling ${asset.code} for currency ${this.config.code}`)
    this.ledger.emitter.emit("externalOfferUpdated", this, { ...sellOfferOptions, created: !offer })
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
   * Compute the keypairs required to sign a transaction given the available keys and
   * the set of signers needed.
   */
  signerKeys(keys: Record<string, Keypair>, signers: Set<string>): Keypair[] {
    const keyMap = Object.fromEntries(Object.values(keys).filter(Boolean).map(kp => [kp.publicKey(), kp]))
    const keyPairs = Array.from(signers).map((pk) => keyMap[pk])
    return keyPairs
  }

  /**
   * Create the necessary accounts and trustlines for the currency in the Stellar network, including
   * the infrastructure for external trading.
   * @param keys 
   */
  async enable(keys: {
    sponsor: Keypair // For paying the fee, for sponsoring reserves and as source account for the transaction.
    issuer: Keypair,  // 
    credit: Keypair,
    admin: Keypair,
    externalIssuer: Keypair,
    externalTrader: Keypair
  }) {
    const builder = this.ledger.sponsorTransactionBuilder()
    const signers = new Set<string>()
    this.installCurrencyTransaction(builder, signers)
    // Issuer account may exist already if the currency was previously disabled.
    const existingIssuer = await this.findAccount(this.data.externalIssuerPublicKey)
    if (existingIssuer === null) {
      this.installExternalIssuer(builder, signers)
    }
    this.installExternalTrader(builder, signers)

    const keyPairs = this.signerKeys(keys, signers)
    await this.ledger.submitTransaction(builder, keyPairs, keys.sponsor)
    
  }


  /**
   * Create the necessary accounts and trustlines for the currency in the Stellar network.
   * Only the local model is created.
   * @param keys 
   */
  private installCurrencyTransaction(builder: TransactionBuilder, signers: Set<string>) {
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
    signers.add(sponsorPublicKey)
    signers.add(this.data.issuerPublicKey)
    // 2. Credit account.
    this.createAccountTransaction(builder, {
      publicKey: this.data.creditPublicKey,
      maximumBalance: undefined
    }, signers)
    // 2.1 Initially fund credit account
    builder.addOperation(Operation.payment({
      source: this.data.issuerPublicKey,
      destination: this.data.creditPublicKey,
      asset: this.asset(),
      amount: this.creditAccountStartingBalance()
    }))
    signers.add(this.data.creditPublicKey)

    // 3. Admin account
    this.createAccountTransaction(builder, {
      publicKey: this.data.adminPublicKey,
      maximumBalance: undefined
    }, signers)

  }
  /**
   * Creates the external issuer account. This account issues the global HOUR asset
   * required for external trading.
   * 
   * @param builder 
   */
  installExternalIssuer(builder: TransactionBuilder, signers: Set<string>) {
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
    signers.add(sponsorPublicKey)
    signers.add(this.data.externalIssuerPublicKey)
  }

  /**
   * Creates the external trader account. This account is used for external trading.
   * @param builder
   */
  installExternalTrader(builder: TransactionBuilder, signers: Set<string>) {
    const sponsorPublicKey = this.ledger.sponsorPublicKey.publicKey()

    // Create external trader with local currency balance.
    this.createAccountTransaction(builder, {
      publicKey: this.data.externalTraderPublicKey,
      maximumBalance: this.config.externalTraderMaximumBalance
    }, signers)
    
    if (this.config.externalTraderInitialCredit) {
      this.addCreditTransaction(builder, this.data.externalTraderPublicKey, this.config.externalTraderInitialCredit, this.creditAccountStartingBalance(), signers)
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
      signers.add(this.data.externalIssuerPublicKey)
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
        price: { n: this.config.rate.d, d: this.config.rate.n }
      }))
    }
    builder.addOperation(Operation.endSponsoringFutureReserves({
      source: this.data.externalTraderPublicKey
    }))

  }

  private externalTraderStartingHoursBalance(): string {
    return this.fromLocalToHour(Big(this.config.externalTraderMaximumBalance)
      .minus(this.config.externalTraderInitialCredit)
      .toString()
    )
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
  fundCreditAccountTransaction(builder: TransactionBuilder, creditAccountBalance: string, minAmount: string | undefined, signers: Set<string>) {
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
      signers.add(this.data.issuerPublicKey)
      logger.info(`Funding the credit account with ${asset.code} ${amount}`)
    }
  }

  // Return the balance that the credit account should have so it can continue its operation for 
  // some time. Before we need to fund it again.
  // At this time this is arbitrarily set to 1000 hours.
  private creditAccountStartingBalance(): string {
    return this.fromHourToLocal("1000")
  }

  /**
   * Adds the necessary operations to t to create a new account with a trustline to this local currency 
   * with limit config.maximumBalance. Note that this transaction will need to be signed by the sponsor, the new account,
   * the issuer.
   * 
   * You may want to call {@link addCreditTransaction} to give some credit to the account.
   * 
   * @param t The transaction builder.
   * @param config Account parameters.
   */
  private createAccountTransaction(t: TransactionBuilder, config: { publicKey: string, maximumBalance?: string, adminSigner?: string }, signers: Set<string>) {    const sponsorPublicKey = this.ledger.sponsorPublicKey.publicKey()
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
    signers.add(sponsorPublicKey)
    signers.add(this.data.issuerPublicKey)
    signers.add(config.publicKey)
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

  addCreditTransaction(t: TransactionBuilder, publicKey: string, credit: string, creditAccountBalance: string, signers: Set<string>) {
    if (Big(credit).gt(0)) {
      this.fundCreditAccountTransaction(t, creditAccountBalance, credit, signers)

      const asset = this.asset()
      t.addOperation(Operation.payment({
        source: this.data.creditPublicKey,
        destination: publicKey,
        asset,
        amount: credit
      }))
      signers.add(this.data.creditPublicKey)
    }
  }
  /**
   * Implements {@link LedgerCurrency#createAccount()}
   */
  async createAccount(options: {
    initialCredit: string,
    maximumBalance?: string,
  }, keys: {
    sponsor: Keypair
    issuer: Keypair,
    credit?: Keypair, // Only if defaultInitialCredit > 0
    account?: Keypair, // Optional account keypair to use instead of generating a new one.
  }): Promise<{ key: Keypair }> {
    if (keys.credit && Big(options.initialCredit).eq(0)) {
      throw internalError("Credit key not allowed if initialCredit is 0")
    }
    if (!keys.credit && Big(options.initialCredit).gt(0)) {
      throw internalError("Credit key required if initialCredit is positive")
    }
    // Create keypair.
    const account = keys.account ?? Keypair.random()
    const issuerAccount = await this.issuerAccount()
    const builder = this.ledger.transactionBuilder(issuerAccount)
    const signers = new Set<string>()

    this.createAccountTransaction(builder, {
      publicKey: account.publicKey(),
      maximumBalance: options.maximumBalance,
      adminSigner: this.data.adminPublicKey
    }, signers)
    const creditAccount = await this.creditAccount()
    this.addCreditTransaction(builder, account.publicKey(), options.initialCredit, creditAccount.balance(), signers)

    const keyPairs = this.signerKeys({...keys, account}, signers)
    await this.ledger.submitTransaction(builder, keyPairs, keys.sponsor)

    logger.info({ publicKey: account.publicKey() }, `Created new account for currency ${this.config.code}`)

    return { key: account }
  }
  /**
   * Implements {@link LedgerCurrency#getAccount}. 
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
   * The same as {@link getAccount} but returns null if the account does not exist.
   * @param publicKey 
   * @returns 
   */
  async findAccount(publicKey: string): Promise<StellarAccount | null> {
    try {
      return await this.getAccount(publicKey)
    } catch (error) {
      if (this.ledger.isNotFoundError(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * Convert an amount in local currency to hours with 7 digits of precision.
   * @param amountInLocal The amount in local currency.
   * @returns The amount in hours.
   */
  fromLocalToHour(amountInLocal: string): string {
    return Big(amountInLocal).times(this.config.rate.n).div(this.config.rate.d).toFixed(7, Big.roundDown)
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
   * Implements {@link LedgerCurrency#quotePath}, adding additional asset properties to the result.
   */
  async quotePath(data: { destCode: string, destIssuer: string, amount: string, retry?: boolean }): Promise<false | PathQuote> {
    const destAsset = new Asset(data.destCode, data.destIssuer)
    const noPathFound = new Error("No viable path found")
    const fn = async () => {

      logger.debug(`Finding path from ${this.asset().code} to ${destAsset.code} for amount ${data.amount}`)

      const paths = await this.ledger.callServer((server) =>
        server.strictReceivePaths(
          [this.asset()],
          destAsset,
          data.amount
        ).call()
      )

      // Filter out paths that are not sending the required amount.
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
  async getTransfer(hash: string): Promise<LedgerTransfer | LedgerExternalTransfer> {
    const transaction = await this.ledger.callServer((server) => server.transactions().transaction(hash).call())

    if (!transaction) {
      throw notFound(`Transaction ${hash} not found`)
    }
    const operations = await transaction.operations({ limit: 100 })
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

  async enableAccount(options: { balance: string; credit: string; maximumBalance?: string }, keys: { account: KeyPair; issuer: KeyPair; disabledAccountsPool: KeyPair; sponsor: KeyPair; }): Promise<void> {
    // (re-)create account.
    const issuerAccount = await this.issuerAccount()
    const builder = this.ledger.transactionBuilder(issuerAccount)
    const accountKey = keys.account.publicKey()
    const signers = new Set<string>()
    this.createAccountTransaction(builder, {
      publicKey: accountKey,
      adminSigner: this.data.adminPublicKey,
      maximumBalance: options.maximumBalance
    }, signers)

    const requiredBalance = Big(options.balance)
    if (requiredBalance.gt(Big(0))) {
      builder.addOperation(Operation.payment({
        asset: this.asset(),
        source: keys.disabledAccountsPool.publicKey(),
        destination: accountKey,
        amount: requiredBalance.toString()
      }))
      signers.add(keys.disabledAccountsPool.publicKey())
    }

    const keyPairs = this.signerKeys(keys, signers)
    const response = await this.ledger.submitTransaction(builder, keyPairs, keys.sponsor)

    logger.info({ hash: response.hash, account: accountKey }, `Enabled account ${accountKey} for currency ${this.config.code}.`)
  }

  /**
   * Disable existing trustline by:
   * 1) Removing associated offer from external trader
   * 2) Moving the balance (if any) to external issuer
   * 3) Removing the trustline from external trader
   */
  async disableTrustline(line: { trustedPublicKey: string }, keys: { sponsor: Keypair, externalTrader: Keypair, externalIssuer: Keypair }): Promise<void> {
    const asset = new Asset(StellarCurrency.GLOBAL_ASSET_CODE, line.trustedPublicKey)
    const externalTraderAccount = await this.externalTraderAccount()
    const trustline = externalTraderAccount.balances().find((b) => b.asset.equals(asset))

    if (!trustline) {
      logger.info({ line }, `No trustline to disable for currency ${this.config.code} and asset ${asset.code}.`)
      return
    }
    const signers = [keys.externalTrader]
    const builder = this.ledger.transactionBuilder(externalTraderAccount)
    const offer = await this.fetchExternalOffer(this.hour(), asset)

    // 1. Remove associated offer.
    if (offer) {
      builder.addOperation(Operation.manageSellOffer({
        offerId: offer.id,
        selling: this.hour(),
        buying: trustline.asset,
        amount: "0",
        price: offer.price
      }))
    }
    // 2. If there is any balance, move it to external issuer (adding trustline to issuer).
    if (Big(trustline.balance).gt(0)) {
      // 2.1 Add trustline to external issuer.
      builder.addOperation(Operation.changeTrust({
        source: this.data.externalIssuerPublicKey,
        asset: trustline.asset,
        limit: trustline.balance
      }))
      signers.push(keys.externalIssuer)
      // 2.2 Move balance to external issuer.
      builder.addOperation(Operation.payment({
        destination: this.data.externalIssuerPublicKey,
        asset: trustline.asset,
        amount: trustline.balance.toString()
      }))
    }
    // 3. Remove trustline.
    builder.addOperation(Operation.changeTrust({
      asset: trustline.asset,
      limit: "0"
    }))

    await this.ledger.submitTransaction(builder, signers, keys.sponsor)
    logger.info({ line }, `Disabled trustline to ${asset.code} for currency ${this.config.code}.`)

  }

  async disable(keys: { sponsor: Keypair, externalTrader: Keypair, externalIssuer: Keypair, admin: Keypair, credit: Keypair, issuer: Keypair }): Promise<void> {
    // Disable all trustlines. 
    // We do it in separate transactions to avoid hitting total operation limit per transaction.
    const externalTraderAccount = await this.externalTraderAccount()
    const trustlines = externalTraderAccount.balances().filter(
      (b) => !b.asset.equals(this.hour()) && !b.asset.equals(this.asset())
    )
    for (const trustline of trustlines) {
      await this.disableTrustline({
        trustedPublicKey: trustline.asset.issuer!
      }, {
        sponsor: keys.sponsor,
        externalTrader: keys.externalTrader,
        externalIssuer: keys.externalIssuer
      })
    }

    // Remove local offers (h<->asset) and burn hour balance.
    const issuer = await this.issuerAccount()
    const builder = this.ledger.transactionBuilder(issuer)
    const signers: Keypair[] = []

    const localAssetOffer = await this.fetchExternalOffer(this.asset(), this.hour())

    if (localAssetOffer) {
      builder.addOperation(Operation.manageSellOffer({
        source: this.data.externalTraderPublicKey,
        offerId: localAssetOffer.id,
        selling: this.asset(),
        buying: this.hour(),
        amount: "0",
        price: localAssetOffer.price
      }))
    }
    const localHourOffer = await this.fetchExternalOffer(this.hour(), this.asset())
    if (localHourOffer) {
      builder.addOperation(Operation.manageSellOffer({
        source: this.data.externalTraderPublicKey,
        offerId: localHourOffer.id,
        selling: this.hour(),
        buying: this.asset(),
        amount: "0",
        price: localHourOffer.price
      }))
    }
    const localHourBalance = externalTraderAccount.balance(this.hour())
    if (Big(localHourBalance).gt(0)) {
      builder.addOperation(Operation.payment({
        source: this.data.externalTraderPublicKey,
        destination: this.data.externalIssuerPublicKey,
        asset: this.hour(),
        amount: localHourBalance
      }))
    }
    builder.addOperation(Operation.changeTrust({
      source: this.data.externalTraderPublicKey,
      asset: this.hour(),
      limit: "0"
    }))

    // Delete external trader
    externalTraderAccount.moveBalanceAndDeleteTransaction(builder, this.data.issuerPublicKey)
    signers.push(keys.externalTrader)

    // Delete disabled accounts pool.
    if (this.data.disabledAccountsPoolPublicKey) {
      const pool = await this.getAccount(this.data.disabledAccountsPoolPublicKey)
      pool.moveBalanceAndDeleteTransaction(builder, this.data.issuerPublicKey)
      // admin is signer of disabled accounts pool and will be added later anyway.
    }

    const deleteAccountTransaction = (accountKey: string) => {
      builder.addOperation(Operation.accountMerge({
        source: accountKey,
        destination: this.ledger.sponsorPublicKey.publicKey()
      }))
    }

    // Delete external issuer if it has no balances nor incomming trustlines.
    const externalIssuer = await this.externalIssuerAccount()
    const externalIssuerBalances = externalIssuer.balances()
    let keepExternalIssuer = true
    if (externalIssuerBalances.length === 0) {
      const externalTrustlinesResult = await this.ledger.callServer((server) =>
        server.accounts().forAsset(this.hour()).limit(2).call()
      )
      const externalTrustlines = externalTrustlinesResult.records.filter(a => a.account_id !== this.data.externalTraderPublicKey)
      if (externalTrustlines.length === 0) {
        keepExternalIssuer = false
        deleteAccountTransaction(this.data.externalIssuerPublicKey)
        signers.push(keys.externalIssuer)
      }
    }

    // Delete admin account
    const adminAccount = await this.getAccount(this.data.adminPublicKey)
    adminAccount.moveBalanceAndDeleteTransaction(builder, this.data.issuerPublicKey)
    signers.push(keys.admin)

    // Delete credit account.
    const creditAccount = await this.creditAccount()
    creditAccount.moveBalanceAndDeleteTransaction(builder, this.data.issuerPublicKey)
    signers.push(keys.credit)

    // Delete issuer account
    deleteAccountTransaction(this.data.issuerPublicKey)
    signers.push(keys.issuer)

    await this.ledger.submitTransaction(builder, signers, keys.sponsor)
    logger.info(`Disabled currency ${this.config.code}.`)
    if (keepExternalIssuer) {
      logger.info(`External issuer for currency ${this.config.code} was not deleted because it has existing incoming trustlines or external balances.`)
    }
  }

  async logExternalState(): Promise<void> {
    const externalTrader = await this.externalTraderAccount()
    const offers = await this.fetchExternalOffers()
    logger.info(`External state for currency ${this.config.code}: ${this.data.externalTraderPublicKey}`)
    
    const printAsset = (asset: Asset | OfferAsset) => {
      const actualAsset = (asset instanceof Asset) ? asset : new Asset(asset.asset_code!, asset.asset_issuer)
      if (this.hour().equals(actualAsset)) {
        return `HOUR`
      } else if (this.asset().equals(actualAsset)) {
        return `${this.asset().code}`
      } else {
        return `${actualAsset.code}:${actualAsset.issuer.substring(0, 5)}`
      }
    }
    const logOffer = (selling: Asset, buying: Asset) => {
      const offer = offers.find((o) =>
        o.selling.asset_code === selling.code &&
        o.selling.asset_issuer === selling.issuer &&
        o.buying.asset_code === buying.code &&
        o.buying.asset_issuer === buying.issuer
      )
      if (offer) {
        logger.info(`     Offer: Selling ${printAsset(selling)} for ${printAsset(buying)}, amount: ${offer.amount}, price: ${offer.price_r.n}/${offer.price_r.d}`)
      }

    }
    externalTrader.balances().forEach((b) => {
      if (b.asset.equals(this.hour())) {
        logger.info(`   HOUR: ${b.balance} (limit: ${b.limit})`)
      } else {
        logger.info(`   ${printAsset(b.asset)}: ${b.balance} (limit: ${b.limit})`)
        logOffer(b.asset, this.hour())
        logOffer(this.hour(), b.asset)
      }
    })
  }

  /**
   * Implements {@link LedgerCurrency#reconcileExternalState}
   */
  async reconcileExternalState(lines: ExternalTrustline[], keys: { sponsor: Keypair, credit: KeyPair, issuer: KeyPair, externalTrader: Keypair, externalIssuer: Keypair }) {
    logger.debug(`Reconciling external state for currency ${this.config.code}`)
    
    const account = await this.externalTraderAccount()
    const externalIssuer = await this.externalIssuerAccount()
    // get balances
    const trustlines = account.balances()
    const findTrustline = (asset: Asset) => trustlines.find((b) => b.asset.equals(asset))
    // get trustlines
    const offers = await this.fetchExternalOffers()
    const offerAssetEq = (a: OfferAsset, b: Asset) => {
      return a.asset_type == b.getAssetType() && a.asset_code === b.code && a.asset_issuer === b.issuer
    }
    const rateEq = (a: Rate|undefined, b: Rate|undefined) => a?.n === b?.n && a?.d === b?.d
    /**
     * Find the offer buying -> selling.
     */
    const findOffer = (buying: Asset, selling: Asset) => offers.find((o) =>
      offerAssetEq(o.selling, selling) && offerAssetEq(o.buying, buying)
    )
    // Compute the total hour balance required to back all offers.
    const localAssetInitialCredit = Big(this.config.externalTraderInitialCredit ?? 0)
    const existingLocalAssetInitialCredit = Big(await account.credit())
    const localAssetMaximumBalance = Big(this.config.externalTraderMaximumBalance)
    const localAssetTrustline = findTrustline(this.asset())
    const existingLocalAssetBalance = Big(localAssetTrustline?.balance ?? 0)
    const localAssetBalance = existingLocalAssetBalance.plus(localAssetInitialCredit).minus(existingLocalAssetInitialCredit)
    // Sanity check: local asset balance must be positive.
    if (localAssetBalance.lt(0)) {
      throw badRequest(`Cannot reduce initial credit below existing balance of ${existingLocalAssetBalance.toString()}.`)
    }
    // The available room in local asset trustline, converted to hours.
    const hourBalanceForLocalAsset = Big(this.fromLocalToHour(localAssetMaximumBalance.minus(localAssetBalance).toString()))
    const totalHourBalance = lines.reduce((total, line) => {
      const asset = new Asset(StellarCurrency.GLOBAL_ASSET_CODE, line.externalIssuerKey)
      const trustline = findTrustline(asset)
      const limit = this.fromLocalToHour(line.limit)
      return total.plus(limit).minus(trustline?.balance ?? 0)
    }, hourBalanceForLocalAsset)

    const localHourTrustline = findTrustline(this.hour())
    const existingHourBalance = Big(localHourTrustline?.balance ?? 0)

    const builder = this.ledger.transactionBuilder(account, { sequential: true })
    const signers = new Set<string>()

    /**
     * Creates or updates a passive sell offer buying -> selling with the given amount (in selling asset) and price
     * (price of 1 unit of selling in terms of buying).
     */
    const updateSellOffer = (builder: TransactionBuilder, options: {
      buying: Asset, selling: Asset, amount: string, price: Rate
    }, signers: Set<string>) => {
      const existingOffer = findOffer(options.buying, options.selling)
      if (!existingOffer && Big(options.amount).gt(0)) {
        logger.debug(`Creating offer selling ${options.amount} ${options.selling.code} for ${options.buying.code} at rate ${options.price.n}/${options.price.d}`)
        builder.addOperation(Operation.beginSponsoringFutureReserves({
          source: this.ledger.sponsorPublicKey.publicKey(),
          sponsoredId: this.data.externalTraderPublicKey
        }))
        signers.add(this.ledger.sponsorPublicKey.publicKey())
        builder.addOperation(Operation.createPassiveSellOffer({
          source: this.data.externalTraderPublicKey,
          ...options
        }))
        signers.add(this.data.externalTraderPublicKey)
        builder.addOperation(Operation.endSponsoringFutureReserves({
          source: this.data.externalTraderPublicKey
        }))
        
      } else if (existingOffer && (!Big(existingOffer.amount).eq(options.amount) || !rateEq(existingOffer.price_r, options.price))) {
        logger.debug(`Updating offer from selling ${existingOffer.amount} to selling ${options.amount} ${options.selling.code} for ${options.buying.code} at rate ${options.price.n}/${options.price.d}`)
        builder.addOperation(Operation.manageSellOffer({
          offerId: existingOffer.id,
          source: this.data.externalTraderPublicKey,
          ...options
        }))
        signers.add(this.data.externalTraderPublicKey)
      }
    }
    /**
     * Creates or updates a trustline for the given asset with the given limit.
     */
    const updateTrustline = (builder: TransactionBuilder, options: { asset: Asset, limit: string | undefined }, signers: Set<string>) => {
      const existingTrustline = findTrustline(options.asset)
      if (existingTrustline === undefined) {
        builder.addOperation(Operation.beginSponsoringFutureReserves({
          source: this.ledger.sponsorPublicKey.publicKey(),
          sponsoredId: this.data.externalTraderPublicKey
        }))
        signers.add(this.ledger.sponsorPublicKey.publicKey())
      }
      if (existingTrustline === undefined || !(options.limit === undefined ? UNDEFINED_TRUSTLINE_LIMIT : Big(options.limit)).eq(existingTrustline.limit)) {
        logger.debug(`Updating trustline ${options.asset.code} from ${existingTrustline?.limit} to ${options.limit}`)
        builder.addOperation(Operation.changeTrust({
          source: this.data.externalTraderPublicKey,
          asset: options.asset,
          limit: options.limit
        }))
        signers.add(this.data.externalTraderPublicKey)
      }
      if (existingTrustline === undefined) {
        builder.addOperation(Operation.endSponsoringFutureReserves({
          source: this.data.externalTraderPublicKey
        }))
      }
    }

    /**
     * Makes sure the external account has:
     *  - A trustline to the given asset with the given limit.
     *  - A passive sell offer asset => hour (buying asset and selling hour) for the given rate and amount equal to existing balance in asset. 
     *  - A passive sell offer hour => asset (buying hour and selling asset) for the inverse of the given rate and amount equal to the available room in the trustline (limit - balance).
     *  - The adjusted balance by calling adjustBalance.
     * 
     * This function makes the necessary operations in the correct order to avoid transient states that would violate
     * offer liabilities or trustline limits.
     * 
     * @param limit Trustline limit expressed in units of the given asset.
     * @param balance Desired balance expressed in units of the given asset.
     * @param rate Price of 1 unit of the given asset in hours.
     * @param adjustBalance A function that will add the necessary operations to adjust the balance to the desired value.
     */
    const updateRelationship = async (
      builder: TransactionBuilder, 
      asset: Asset, 
      limit: string, // in units of asset
      balance: string, // in units of asset
      rate: Rate, // price of 1 unit of asset in hours
      adjustBalance: (builder: TransactionBuilder, signers: Set<string>) => Promise<void>,
      signers: Set<string>
    ) => {
      const hour = this.hour()
      const existingTrustline = findTrustline(asset)

      const targetLimit = Big(limit)
      const existingLimit = Big(existingTrustline?.limit ?? 0)

      const existingSellingOffer = findOffer(hour, asset) // hour -> asset
      const existingBuyingOffer = findOffer(asset, hour) // asset -> hour

      // Stellar offer: price of 1 unit of selling in terms of buying
      // Amount in selling asset.
      const targetSellingOffer = {
        buying: hour,
        selling: asset,
        amount: balance,
        price: rate
      }
      const targetBuyingOffer = {
        buying: asset,
        selling: hour,
        amount: Big(limit).minus(balance).times(rate.n).div(rate.d).toFixed(7, Big.roundDown), // amount in selling asset
        price: { n: rate.d, d: rate.n }
      }
      
      // We compare size of existing offers in asset units since we're concerned about
      // the asset trustline size and balance.
      
      const existingSellingOfferAmount = Big(existingSellingOffer?.amount ?? 0)
      const existingBuyingOfferAmount = Big(existingBuyingOffer?.amount ?? 0).times(rate.d).div(rate.n)
      const targetSellingOfferAmount = Big(balance)
      const targetBuyingOfferAmount = Big(limit).minus(balance)

      // We need to make operations in a very specific order to avoid transient states that would violate
      // offer liabilities or trustline limits. A safe order is the following:

      // Increase trustline
      if (targetLimit.gt(existingLimit)) {
        updateTrustline(builder, {asset, limit: targetLimit.toString()}, signers)
      }

      // Reduce offers
      if (targetSellingOfferAmount.lt(existingSellingOfferAmount)) {  
        updateSellOffer(builder, targetSellingOffer, signers)
      }
      if (targetBuyingOfferAmount.lt(existingBuyingOfferAmount)) {  
        updateSellOffer(builder, targetBuyingOffer, signers)
      }
      
      // Adjust balance
      await adjustBalance(builder, signers)

      // Increase offers (or update if price changed)
      const shouldUpdateSelling = targetSellingOfferAmount.gt(existingSellingOfferAmount) 
        || (targetSellingOfferAmount.eq(existingSellingOfferAmount) && !rateEq(targetSellingOffer.price, existingSellingOffer?.price_r))
      if (shouldUpdateSelling) {  
        updateSellOffer(builder, targetSellingOffer, signers)
      }
      
      const shouldUpdateBuying = targetBuyingOfferAmount.gt(existingBuyingOfferAmount) 
        || (targetBuyingOfferAmount.eq(existingBuyingOfferAmount) && !rateEq(targetBuyingOffer.price, existingBuyingOffer?.price_r))
      if (shouldUpdateBuying) {  
        updateSellOffer(builder, targetBuyingOffer, signers)
      }

      // Reduce trustline
      if (targetLimit.lt(existingLimit)) {
        updateTrustline(builder, {asset, limit: targetLimit.toString()}, signers)
      }
    }
    /**
     * Update the relationship with the local asset, including adjusting the initial credit.
     */
    const updateLocalRelationship = async () => {
      const adjustBalance = async (builder: TransactionBuilder, signers: Set<string>) => {
        if (localAssetInitialCredit.gt(existingLocalAssetInitialCredit)) {
          logger.debug(`Increasing local asset credit from ${existingLocalAssetInitialCredit.toString()} to ${localAssetInitialCredit.toString()}`)
          const diff = localAssetInitialCredit.minus(existingLocalAssetInitialCredit).toString()
          const creditAccount = await this.creditAccount()
          this.addCreditTransaction(builder, this.data.externalTraderPublicKey, diff, creditAccount.balance(), signers)
        } else if (localAssetInitialCredit.lt(existingLocalAssetInitialCredit)) {
          logger.debug(`Decreasing local asset credit from ${existingLocalAssetInitialCredit.toString()} to ${localAssetInitialCredit.toString()}`)
          const diff = existingLocalAssetInitialCredit.minus(localAssetInitialCredit).toString()
          builder.addOperation(Operation.payment({
            source: this.data.externalTraderPublicKey,
            destination: this.data.creditPublicKey,
            asset: this.asset(),
            amount: diff
          }))
          signers.add(this.data.externalTraderPublicKey)
        }
      }
      await updateRelationship(
        builder, 
        this.asset(), 
        localAssetMaximumBalance.toString(), 
        localAssetBalance.toString(), 
        this.config.rate, 
        adjustBalance, 
        signers
      )
    }
    
    /**
     * Update the relationship with the given external HOUR asset, including moving the eventual balance from
     * the external issuer.
     */
    const updateExternalRelationship = async (builder: TransactionBuilder, asset: Asset, limit: string, signers: Set<string>) => {
      const existingTrustline = findTrustline(asset)
      const externalIssuerTrustline = externalIssuer.balances().find(b => b.asset.equals(asset))

      const existingBalance = Big(existingTrustline?.balance ?? 0)
      const externalIssuerBalance = Big(externalIssuerTrustline?.balance ?? 0)

      const balance = existingBalance.plus(externalIssuerBalance)

      const adjustBalance = async (builder: TransactionBuilder, signers: Set<string>) => {
        // Disabled trustlines move the balance to external issuer. Now we may be enabling a
        // previously disabled trustline so we recover the balance from external issuer.
        if (externalIssuerTrustline) {
          if (externalIssuerBalance.gt(0)) {
            logger.debug(`Recovering ${externalIssuerBalance.toString()} ${asset.code} balance from external issuer`)
            builder.addOperation(Operation.payment({
              source: this.data.externalIssuerPublicKey,
              destination: this.data.externalTraderPublicKey,
              asset,
              amount: externalIssuerBalance.toString()
            }))
            signers.add(this.data.externalIssuerPublicKey)
          }
          // Revoke trustline from external issuer.
          builder.addOperation(Operation.changeTrust({
            source: this.data.externalIssuerPublicKey,
            asset,
            limit: "0"
          }))
        }
      }

      await updateRelationship(
        builder,
        asset,
        limit,
        balance.toString(),
        {n: 1, d: 1},
        adjustBalance,
        signers
      )

    }

    /**
     * Disable the relationship with the given asset by removing offers, moving balance -if any- 
     * to external issuer and removing trustline.*/
    const disableRelationship = (builder: TransactionBuilder, asset: Asset, signers: Set<string>) => {
      logger.debug(`Disabling relationship with ${asset.code}`)
      const existingTrustline = findTrustline(asset)
      const existingSellingOffer = findOffer(this.hour(), asset) // hour -> asset
      const existingBuyingOffer = findOffer(asset, this.hour()) // asset -> hour
      // Remove associated offers.
      if (existingSellingOffer) {
        builder.addOperation(Operation.manageSellOffer({
          source: this.data.externalTraderPublicKey,
          offerId: existingSellingOffer.id,
          selling: this.hour(),
          buying: asset,
          amount: "0",
          price: existingSellingOffer.price_r
        }))
      }
      if (existingBuyingOffer) {
        builder.addOperation(Operation.manageSellOffer({
          source: this.data.externalTraderPublicKey,
          offerId: existingBuyingOffer.id,
          selling: asset,
          buying: this.hour(),
          amount: "0",
          price: existingBuyingOffer.price_r
        }))
      }
      // Move existing balance to external issuer, including sponsored trustline.
      if (existingTrustline?.balance && Big(existingTrustline.balance).gt(0)) {
        builder.addOperation(Operation.beginSponsoringFutureReserves({
          source: this.ledger.sponsorPublicKey.publicKey(),
          sponsoredId: this.data.externalIssuerPublicKey
        }))
        signers.add(this.ledger.sponsorPublicKey.publicKey())
        builder.addOperation(Operation.changeTrust({
          source: this.data.externalIssuerPublicKey,
          asset: asset,
          limit: existingTrustline.balance
        }))
        signers.add(this.data.externalIssuerPublicKey)
        builder.addOperation(Operation.endSponsoringFutureReserves({
          source: this.data.externalIssuerPublicKey
        }))
        builder.addOperation(Operation.payment({
          source: this.data.externalTraderPublicKey,
          destination: this.data.externalIssuerPublicKey,
          asset: asset,
          amount: existingTrustline.balance
        }))
        signers.add(this.data.externalTraderPublicKey)
      }
      // Finally remove the trustline.
      builder.addOperation(Operation.changeTrust({
        source: this.data.externalTraderPublicKey,
        asset: asset,
        limit: "0"
      }))
      signers.add(this.data.externalTraderPublicKey)
    }
    
    // 1. Remove existing offers and trustlines that are not in the desired lines, and move their 
    // balances to external issuer.
    const toDisable = trustlines.filter((balance) => {
      return !this.hour().equals(balance.asset)
      && !this.asset().equals(balance.asset)
      && !lines.some(b => b.externalIssuerKey === balance.asset.issuer && balance.asset.code === StellarCurrency.GLOBAL_ASSET_CODE)
    })
    for (const balance of toDisable) {
      disableRelationship(builder, balance.asset, signers)
    }

    // 2. Create the unlimited trustline for local HOUR.
    updateTrustline(builder, {asset: this.hour(), limit: undefined}, signers)
    // 3. Ensure hour balance is sufficient.
    if (totalHourBalance.gt(existingHourBalance)) {
      logger.debug(`Increasing hour balance from ${existingHourBalance.toString()} to ${totalHourBalance.toString()}`)
      const diff = totalHourBalance.minus(existingHourBalance).toString()
      builder.addOperation(Operation.payment({
        source: this.data.externalIssuerPublicKey,
        destination: this.data.externalTraderPublicKey,
        asset: this.hour(),
        amount: diff
      }))
      signers.add(this.data.externalIssuerPublicKey)
    }

    // 4. Handle local asset.
    await updateLocalRelationship()

    // 5. Handle all external currencies.
    for (const line of lines) {
      const externalAsset = new Asset(StellarCurrency.GLOBAL_ASSET_CODE, line.externalIssuerKey)
      const limit = this.fromLocalToHour(line.limit)
      await updateExternalRelationship(builder, externalAsset, limit, signers)
    }

    // 6. Reduce hour balance if needed.
    if (totalHourBalance.lt(existingHourBalance)) {
      logger.debug(`Reducing hour balance from ${existingHourBalance.toString()} to ${totalHourBalance.toString()}`)
      const diff = existingHourBalance.minus(totalHourBalance).toString()
      builder.addOperation(Operation.payment({
        source: this.data.externalTraderPublicKey,
        destination: this.data.externalIssuerPublicKey,
        asset: this.hour(),
        amount: diff
      }))
      signers.add(this.data.externalTraderPublicKey)
    }

    if (signers.size === 0) {
      // There were no changes to be made.
      logger.debug(`External state for currency ${this.config.code} is already in desired state.`)
    } else {
      await this.ledger.submitTransaction(builder, this.signerKeys(keys, signers), keys.sponsor)
    }
    await this.logExternalState()
  }

  async getExternalBalances(): Promise<ExternalBalance[]> {
    const balances = new Map<string, ExternalBalance>()
    const hour = this.hour()

    // 1. Compute local balances held in external trader account.
    const account = await this.externalTraderAccount()
    for (const balance of account.balances()) {
      if (!hour.equals(balance.asset) && !this.asset().equals(balance.asset)) {
        const amount = this.fromHourToLocal(balance.balance)
        balances.set(balance.asset.issuer!, {
          externalIssuerKey: balance.asset.issuer!,
          local: {
            balance: amount,
            limit: this.fromHourToLocal(balance.limit)
          },
          balance: Big(amount).neg().toString(),
        })
      }
    }

    // 2. Compute external balances held in other accounts.
    const accounts = await this.ledger.callServer((server) => server.accounts().forAsset(hour).limit(200).call())
    for (const acc of accounts.records) {
      if (acc.account_id === this.data.externalTraderPublicKey) continue

      const b = acc.balances.find((b) =>
        (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
        b.asset_code === hour.code &&
        b.asset_issuer === hour.issuer
      ) as HorizonApi.BalanceLineAsset | undefined

      if (b) {
        const amount = this.fromHourToLocal(b.balance)
        // the account_id is the external trader account for the remote currency,
        // but we need the external issuer key for this currency. We don't have a
        // direct way to get it, so we guess it as the first unlimited trustline
        // to an HOUR asset.
        const externalIssuerBalance = acc.balances.find((b) =>
          (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
          b.asset_code === StellarCurrency.GLOBAL_ASSET_CODE && Big(b.limit).eq(UNDEFINED_TRUSTLINE_LIMIT)
        ) as HorizonApi.BalanceLineAsset | undefined
        if (!externalIssuerBalance) {
          logger.warn(`Cannot determine external issuer for account ${acc.account_id} holding ${amount} HOUR balance for currency ${this.config.code}. Skipping.`)
          continue
        }
        const externalIssuerKey = externalIssuerBalance.asset_issuer
        
        // Update or create entry.
        const entry = balances.get(externalIssuerKey) ?? {
          externalIssuerKey: externalIssuerKey,
          balance: '0'
        }

        entry.external = {
          balance: amount,
          limit: this.fromHourToLocal(b.limit)
        }
        entry.balance = Big(entry.balance).plus(amount).toString()
        balances.set(acc.account_id, entry)
      }
    }
    return Array.from(balances.values())
  }

}
