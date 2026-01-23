// Check error codes in ices komunitin server.
export enum KErrorCode {
  NotFound = "NotFound",
  BadRequest = "BadRequest",
  InternalError = "InternalError",
  Unauthorized = "Unauthorized",
  Forbidden = "Forbidden",
}

const errorDefinitions: Record<KErrorCode, [number, string]> = {
  [KErrorCode.BadRequest]: [400, "Bad Request"],
  [KErrorCode.InternalError]: [500, "Internal Error"],
  [KErrorCode.Unauthorized]: [401, "Unauthorized"],
  [KErrorCode.Forbidden]: [403, "Forbidden"],
  [KErrorCode.NotFound]: [404, "Not Found"],
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

export const badRequest = (message: string = "Bad Request", options?: KErrorOptions) => new KError(KErrorCode.BadRequest, message, options)
export const internalError = (message: string = "Internal Error", options?: KErrorOptions) => new KError(KErrorCode.InternalError, message, options)
export const unauthorized = (message: string = "Unauthorized", options?: KErrorOptions) => new KError(KErrorCode.Unauthorized, message, options)
export const forbidden = (message: string = "Forbidden", options?: KErrorOptions) => new KError(KErrorCode.Forbidden, message, options)
export const notFound = (message: string = "Not Found", options?: KErrorOptions) => new KError(KErrorCode.NotFound, message, options)
