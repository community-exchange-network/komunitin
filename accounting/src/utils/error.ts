// Check error codes in ices komunitin server.
export enum KErrorCode {
  BadRequest = "BadRequest",
  BadConfig = "BadConfig",
  NotFound = "NotFound",
  InternalError = "InternalError",
  NotImplemented = "NotImplemented",
  FieldValidationError = "FieldValidationError",
  Unauthorized = "Unauthorized",
  Forbidden = "Forbidden",
  TransactionError = "TransactionError",
  InsufficientBalance = "InsufficientBalance",
  NoTrustPath = "NoTrustPath",
  InsufficientMaximumBalance = "InsufficientMaximumBalance",
  InactiveCurrency = "InactiveCurrency",
}

const errorDefinitions: Record<KErrorCode, [number, string]> = {
  [KErrorCode.BadRequest]: [400, "Bad Request"],
  [KErrorCode.TransactionError]: [400, "Transaction Error"],
  [KErrorCode.NotFound]: [404, "Not Found"],
  [KErrorCode.BadConfig]: [500, "Bad Configuration"],
  [KErrorCode.NotImplemented]: [500, "Not Implemented"],
  [KErrorCode.InternalError]: [500, "Internal Error"],
  [KErrorCode.FieldValidationError]: [400, "Field validation Error"],
  [KErrorCode.Unauthorized]: [401, "Unauthorized"],
  [KErrorCode.Forbidden]: [403, "Forbidden"],
  [KErrorCode.InsufficientBalance]: [400, "Insufficient Balance"],
  [KErrorCode.InsufficientMaximumBalance]: [400, "Insufficient Maximum Balance"],
  [KErrorCode.NoTrustPath]: [400, "No trust path between currencies"],
  [KErrorCode.InactiveCurrency]: [403, "Currency is not active"],
} as const

const status = (code: KErrorCode) => errorDefinitions[code][0]
const title = (code: KErrorCode) => errorDefinitions[code][1]

interface KErrorOptions extends ErrorOptions {
  details?: any
}


export class KError extends Error {
  public readonly code: KErrorCode
  public readonly details?: any

  constructor(code: KErrorCode, message: string, options?: KErrorOptions) {
    super(message, { cause: options?.cause })
    this.code = code
    this.details = options?.details
  }

  public getStatus() {
    return status(this.code)
  }

  public getTitle() {
    return title(this.code)
  }
}

export const badConfig = (message: string, options?: KErrorOptions) => new KError(KErrorCode.BadConfig, message, options)
export const badRequest = (message: string, options?: KErrorOptions) => new KError(KErrorCode.BadRequest, message, options)
export const internalError = (message: string, options?: KErrorOptions) => new KError(KErrorCode.InternalError, message, options)
export const notFound = (message: string, options?: KErrorOptions) => new KError(KErrorCode.NotFound, message, options)
export const notImplemented = (message: string, options?: KErrorOptions) => new KError(KErrorCode.NotImplemented, message, options)
export const transactionError = (message: string, options?: KErrorOptions) => new KError(KErrorCode.TransactionError, message, options)
export const fieldValidationError = (message: string, options?: KErrorOptions) => new KError(KErrorCode.FieldValidationError, message, options)
export const unauthorized = (message: string, options?: KErrorOptions) => new KError(KErrorCode.Unauthorized, message, options)
export const forbidden = (message: string, options?: KErrorOptions) => new KError(KErrorCode.Forbidden, message, options)
export const insufficientBalance = (message: string, options?: KErrorOptions) => new KError(KErrorCode.InsufficientBalance, message, options)
export const insufficientMaximumBalance = (message: string, options?: KErrorOptions) => new KError(KErrorCode.InsufficientMaximumBalance, message, options)
export const noTrustPath = (message: string, options?: KErrorOptions) => new KError(KErrorCode.NoTrustPath, message, options)
export const inactiveCurrency = (message: string, options?: KErrorOptions) => new KError(KErrorCode.InactiveCurrency, message, options)