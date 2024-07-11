import { Keypair as StellarKeyPair } from "@stellar/stellar-sdk"
import { Rate } from "../utils/types"
import TypedEmitter from "typed-emitter"
/*
 * Architecture:
 *  - Objects never have private keys as properties. Private keys are passed as
 *    arguments to methods when needed. This way we assure we keep the private 
 *    keys in memory as little as possible.
 *  - This interfaces are not meant to have any implementation besides the Stellar
 *    network. They are only defined for better code encapsulation. So you may
 *    find some Stellar specifics, althought they have been kept to the minimum.
 *  - This module does not handle persistence of any type. It is up to the caller
 *    to save the necessary data to recreate the objects, including the private
 *    keys.
 */

/**
 * Private and public key pair for an account.
 */
export type KeyPair = StellarKeyPair

/**
 * Configurable parameters for a Currency.
 * 
 * Note that currencies have always a fixed precision of 7 decimal places.
 */
export type LedgerCurrencyConfig = {
  /** 
   * The 4 letter currency code.
   * */ 
  code: string,
  /**
   * The rate of the currency in HOURs, as a fraction with numerator and denominator.
   * If the rate is 1/10, it means that 1 HOUR is worth 10 units of the currency.
   */
  rate: Rate
  /**
   * The initial balance in local currency for the external trader account.
   * 
   * This is the global trade balance limit for incomming transactions. Or 
   * in other words, it is the total amount of the local currency that can
   * be created by external payments.
   * 
   * Defaults to 0, meaning that we need outgoing payments (to other currencies) 
   * before we can have incoming transfers (from other currencies).
   */
  externalTraderInitialCredit?: string
  /**
   * The maximum balance in local currency for the external trader account.
   * 
   * This value minus the {@link externalTraderInitialCredit} is the global
   * trade balance limit for outgoing payments. Or in other words, it is the
   * total amount of the local currency that can be destroyed by external
   * payments.
   * 
   * Defaults to infinity, meaning that there is no limit to outgoing payments.
   */
  externalTraderMaximumBalance?: string
}

/**
 * The keys needed to manage a currency.
 */
export type LedgerCurrencyKeys = {
  issuer: KeyPair, 
  credit: KeyPair, 
  admin: KeyPair,
  externalIssuer: KeyPair,
  externalTrader: KeyPair
}

/**
 * The public data generated when a currency is created.
 */
export type LedgerCurrencyData = {
  issuerPublicKey: string
  creditPublicKey: string
  adminPublicKey: string
  externalIssuerPublicKey: string
  externalTraderPublicKey: string
}

/**
 * Some data to be updated when running the currency and to 
 * be persisted between runs.
 */
export type LedgerCurrencyState = {
  externalTradesStreamCursor: string
}

/**
 * Event types.
 */
export type LedgerEvents = {
  /**
   * Called after a local payment is made.
   * */
  transfer: (currency: LedgerCurrency, transfer: LedgerTransfer) => Promise<void>
  
  /**
   * Called when a new external payment is received.
   */
  incommingTransfer: (currency: LedgerCurrency, transfer: LedgerTransfer) => Promise<void>

  /**
   * Called when a new external payment is sent.
   */
  outgoingTransfer: (currency: LedgerCurrency, transfer: LedgerTransfer) => Promise<void>

  /**
   * Called when a new external payment is received and it used
   * this trader external hour by local hour offer.
   */
  incommingHourTrade: (currency: LedgerCurrency, trade: {
    externalHour: LedgerAsset
  }) => Promise<void>

  /**
   * Called after uptating an offer from the external trader account.
   */
  externalOfferUpdated: (currency: LedgerCurrency, offer: {
      selling: LedgerAsset
      buying: LedgerAsset
      amount: string
      created: boolean
    }) => Promise<void>

  /**
   * Called when the currency state is updated and the state should be 
   * persisted to the database.
   * 
   * Specifically, this is called when we get events from the Horizon
   * server and the state contains the cursor, so if the app crashes 
   * and restarts we can continue from where we left.
   */
  stateUpdated: (currency: LedgerCurrency, state: LedgerCurrencyState) => Promise<void>
  
  /**
   * Called if there is an error in the event handlers.
   * @param error 
   */
  error: (error: Error) => void
}

/**
 * The starting interface for the ledger.
 */
export interface Ledger {
  /**
   * Create a new currency.
   */
  createCurrency(config: LedgerCurrencyConfig, sponsor: KeyPair): Promise<LedgerCurrencyKeys>
  /**
   * Get a currency object from the configuration and data.
   */
  getCurrency(config: LedgerCurrencyConfig, data: LedgerCurrencyData, state?: LedgerCurrencyState): LedgerCurrency
  /**
   * Registers a listener for the specified event.
   * 
   * The ledger needs to have a listener for the "incommingHourTrade" event to handle the updating of external offers. 
   * You may use the {@link defaultIncommingHourTradeListener} implementation for this.
   * 
   * The "error" event is called when there is an error or unhandled rejection in
   * the event handlers.
   * 
   * @param event The event name
   * @param handler The event handler
   */
  addListener: TypedEmitter<LedgerEvents>['addListener']
  /**
   * Removes a listener.
   */
  removeListener: TypedEmitter<LedgerEvents>['removeListener']
  /**
   * Remove all listeners and stop listening from events in the ledger.
   */
  stop(): void
}

/**
 * A Currency in a ledger.
 */
export interface LedgerCurrency {
  /**
   * Get the local currency asset.
   */
  asset(): LedgerAsset
  /**
   * Create and approve a new account in this currency.
   * 
   * Provide credit key only if initialCredit > 0
   */
  createAccount(options: {
    initialCredit: string
    maximumBalance?: string
  }, keys: {
    sponsor: KeyPair
    issuer: KeyPair,
    credit?: KeyPair,
  }): Promise<{key: KeyPair}>

  /**
   * Get a loaded and updated account object.
   * @param publicKey 
   */
  getAccount(publicKey: string): Promise<LedgerAccount>

  /**
   * Create a trust line from this currency to the specified other currency.
   * 
   * A trust line allows the external account to hold this external currency and 
   * hence the users from the external currency can pay to the users of this currency.
   * 
   * @param line
   *   - trustedPublicKey: The public key of the external issuer from the other currency.
   *   - limit: The maixmum amount of this foreign currency we're willing to hold, in local 
   *            currency units. Set to "0" to remove the trust line.
   * @param keys 
   *   - externalIssuer: Needed to additionally fund the trader account to satisfy the new selling liabilities.
   */
  trustCurrency(line: { trustedPublicKey: string; limit: string }, keys: { sponsor: KeyPair, externalTrader: KeyPair, externalIssuer: KeyPair }): Promise<void>

  /**
   * Checks whether there is a path linking two local currencies.
   * 
   * @param data
   *   destCode: The code of the destination local currency
   *   destIssuer: The public key of the destination local currency issuer
   *   amount: The amount to be received in the destination currency
   * 
   * @returns false if there is no path, or a quote with the source and destination amounts.
   */
  quotePath(data: {destCode: string, destIssuer: string, amount: string, retry?: boolean}): Promise<false | PathQuote>

  /**
   * Updates the trade offer selling an asset by this currency defined hours. This method needs to
   * be called when the balance of external hours (after incomming payments using hour offers) or 
   * local currency (after outgoing external payments) increases for the trader account. 
   * See {@link LedgerCurrencyListener.onIncommingHourTrade}
   * 
   * @param externalHour 
   * @param keys 
   */
  updateExternalOffer(sellingAsset: LedgerAsset, keys: { sponsor: KeyPair; externalTrader: KeyPair }): Promise<void>


  /**
   * Fetches a transaction from the ledger and returns the transfer information associated to it.
   * 
   * @param hash The transaction hash.
   */
  getTransfer(hash: string): Promise<LedgerTransfer|LedgerExternalTransfer>
}

export interface PathQuote {
  sourceAmount: string,
  sourceAsset: LedgerAsset,
  destAsset: LedgerAsset,
  destAmount: string,
  path: LedgerAsset[]
}

/**
 * An account in a ledger.
 */
export interface LedgerAccount {
  
  /**
   * Perform a community currency transfer.
   * @param payment The payment details: destination and amount
   * @param keys The account entry can be either the master key or the admin key for administered accounts.
   */
  pay(payment: {payeePublicKey: string, amount: string}, keys: {account: KeyPair, sponsor: KeyPair}): Promise<LedgerTransfer>

  /**
   * Perform a payment to an account on a different currency.
   * @param payment
   *   amount: The amount to pay in the payee currency. The payee will receive exactly this amount.
   *   payeePublicKey: The public key of the payee account.
   *   externalIssuerPublicKey: The public key of the issuer of the payee currency.
   */
  externalPay(payment: {payeePublicKey: string, amount: string, path: PathQuote}, keys: {account: KeyPair, sponsor: KeyPair}): Promise<LedgerExternalTransfer>

  /**
   * Permanently delete the account from the ledger.
   * 
   * This function returns existing balance to the credit account.
   * @param keys The admin key is required because this is a high threshold operation.
   */
  delete(keys: {admin: KeyPair, sponsor: KeyPair}): Promise<void>

  /**
   * Get the balance of the account in the community currency.
   * 
   * @returns The balance of the account in the community currency.
   */
  balance(): string

  /**
   * Update the account data from the ledger.
   * 
   * Call this method after performing a transaction to get the updated balance.
   */
  update(): Promise<this>

  /**
   * Return the current amount of credit.
   */
  credit(): Promise<string>

  /**
   * Update the balance in this account from the credit account.
   * 
   * The credit key is required when increasing the credit, while the account (or admin)
   * key is required when reducing the credit.
   */
  updateCredit(amount: string, keys: {
    sponsor: KeyPair,
    credit?: KeyPair,
    account?: KeyPair
  }): Promise<string>

}

/**
 * A payment in the ledger
 */
export interface LedgerTransfer {
  payer: string,
  payee: string,
  amount: string,
  asset: LedgerAsset,
  // ledger transaction id.
  hash: string,
}

/**
 * A payment in the ledger involving different currencies
 */
export interface LedgerExternalTransfer extends LedgerTransfer {
  sourceAsset: LedgerAsset,
  sourceAmount: string,
}
/**
 * An asset in the ledger.
 */
export type LedgerAsset = {
  issuer: string,
  code: string
}