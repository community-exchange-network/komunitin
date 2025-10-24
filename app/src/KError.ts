import type { ErrorResponse } from "./store/model";

export enum KErrorCode {
  // Shared server errors codes.
  Unauthorized = "Unauthorized",
  Forbidden = "Forbidden",
  NotFound = "NotFound",
  NotImplemented = "NotImplemented",

  // Accounting service error codes.
  TransactionError = "TransactionError",
  InsufficientBalance = "InsufficientBalance",
  InsufficientMaximumBalance = "InsufficientMaximumBalance",
  NoTrustPath = "NoTrustPath",

  // Social service error codes.
  InvalidPassword = "InvalidPassword", 
  DuplicatedEmail = "DuplicatedEmail",
  BadRequest = "BadRequest",

  // There are more server errors but we're not identifying them and
  // they are all piped to UnknownServer.
  UnknownServer = "UnknownServer",

  // Client errors codes.
  Unknown = "Unknown",
  IncorrectRequest = "IncorrectRequest",
  ServerNoResponse = "ServerNoResponse",
  ServerBadResponse = "ServerBadResponse",
  ResourceNotFound = "ResourceNotFound",
  UnknownVueError = "UnknownVueError",
  UnknownScript = "UnknownScript",
  ErrorHandling = "ErrorHandling",
  PositionTimeout = "PositionTimeout",
  PositionUnavailable = "PositionUnavailable",
  PositionPermisionDenied = "PositionPermisionDenied",
  NotificationsPermissionDenied = "NotificationsPermissionDenied",
  VueWarning = "VueWarning",
  IncorrectCredentials = "IncorrectCredentials",
  AuthNoCredentials = "AuthNoCredentials",
  RequestError = "RequestError",
  InvalidTransferState = "InvalidTransferState",
  InvalidTransfersCSVFile = "InvalidTransfersCSVFile",
  QRCodeError = "QRCodeError",
  NFCReadError = "NFCReadError",
  NFCUnavailable = "NFCUnavailable",
  ExternalPaymentNotAllowed = "ExternalPaymentNotAllowed",
  InvalidAmount = "InvalidAmount",
  DescriptionRequired = "DescriptionRequired",
  AccountNotFound = "AccountNotFound",
  AccountIsNotYours = "AccountIsNotYours",

  /**
   * This condition should not happen and it indicates a programming bug
   * that needs to be solved by the development team. Use it to assert complex
   * conditions.
   */
  ScriptError = "ScriptError",
  UserLoggingOut = "UserLoggingOut",
}

/**
 * @param response The fetch response.
 * @throws KError with the appropriate code.
 */
export async function checkFetchResponse(response: Response) {
  if (!response.ok) {
    const data = await response.json() as ErrorResponse
    // Check that the code is actually known.
    const serverCode = data.errors?.[0]?.code
    const title = data.errors?.[0]?.title
    // check if serverCode is in enum KErrorCode:
    const code = (serverCode && serverCode in KErrorCode) ? serverCode as KErrorCode : KErrorCode.UnknownServer
    throw new KError(code, title);
  }
}

/**
 * Error class with code and additional information.
 */
export default class KError extends Error {
  code: string;
  debugInfo: unknown;

  constructor(code = KErrorCode.Unknown, message = "", cause?: Error, debugInfo?: unknown) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-next-line
    super(message, { cause });
    this.code = code;
    this.debugInfo = debugInfo !== undefined ? debugInfo : null;
  }
  /**
   * Return the localized message.
   */
  getTranslationKey(): string {
    return "Error" + this.code;
  }

  /**
  * Get a KError from a fetch error.
  * @param error The error.
  */
  public static getKError(error: unknown): KError {
    if (error instanceof KError) {
      return error;
    } else if (error instanceof Error) {
      return new KError(KErrorCode.UnknownScript, error.message, error);
    } else {
      return new KError(KErrorCode.UnknownScript, "Unexpected error", undefined, error);
    }
  }
}
