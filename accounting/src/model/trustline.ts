import { type Trustline as TrustlineRecord } from "@prisma/client"
import { Currency } from "./currency"
import { ExternalResource, ExternalResourceIdentifier } from "./resource"

export interface Trustline {
  id: string

  /**
   * The value of this trustline in local currency. This is the maximum amount of
   * external currency that can be held.
   */
  limit: number

  /**
   * This is the balance of trade between the two currencies, in local currency. 
   * 
   * Positive means that this currency has recieved more payments from the external 
   * currency than it has sent. 
   */
  balance: number

  created: Date
  updated: Date

  trusted: ExternalResource<Currency>

  /** 
   * The local currency
   */
  currency: Currency
}

export type InputTrustline = Pick<Trustline, "limit"> & {trusted: ExternalResourceIdentifier}
export type UpdateTrustline = Pick<Trustline, "limit"|"id">

export const recordToTrustline = (record: TrustlineRecord, trusted: ExternalResource<Currency>, currency: Currency): Trustline => ({
  id: record.id,
  
  limit: Number(record.limit),
  balance: Number(record.balance),
  created: record.created,
  updated: record.updated,

  trusted,
  currency
})
