import type { ResourceObject } from "../../store/model"

export type DepositCurrency = "EUR"
export type TopupStatus = 
    "new"
  | "pending"  
  | "payment_completed"
  | "payment_failed" 
  | "transfer_completed"
  | "transfer_failed"
  | "canceling"
  | "canceled"
export type TopupPaymentProvider = "mollie"
export interface MolliePaymentData {
  paymentId: string
  checkoutUrl: string
  status: string
}

export interface Topup extends ResourceObject {
  attributes: {
    status: TopupStatus
    depositAmount: number
    depositCurrency: DepositCurrency
    receiveAmount: number
    paymentProvider: TopupPaymentProvider
    paymentData: MolliePaymentData | null
    meta: {
      description?: string
    }
    
    created: Date
    updated: Date
  }
}

export interface TopupSettings extends ResourceObject {
  attributes: {
    enabled: boolean,
    defaultAllowTopup: boolean,
    depositCurrency: string,
    rate: {
      n: number,
      d: number
    },
    paymentProvider: string,
    minAmount: number,
    maxAmount: number | false,
  }
}

export interface AccountTopupSettings extends ResourceObject {
  attributes: {
    allowTopup: boolean
  }
}