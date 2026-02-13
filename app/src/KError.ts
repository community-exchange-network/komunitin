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
  CamNotAllowed = "CamNotAllowed",
  CamNotFound = "CamNotFound",
  CamNotReadable = "CamNotReadable",
  CamUnknown = "CamUnknown",

  /**
   * This condition should not happen and it indicates a programming bug
   * that needs to be solved by the development team. Use it to assert complex
   * conditions.
   */
  ScriptError = "ScriptError",
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

export function translateKError(t: (key: string) => unknown, error: KError | KErrorCode | string): string {
  const code = typeof error === "string" ? error : error.code;

  switch (code) {
    case KErrorCode.Unauthorized: return String(t("ErrorUnauthorized"));
    case KErrorCode.Forbidden: return String(t("ErrorForbidden"));
    case KErrorCode.NotFound: return String(t("ErrorNotFound"));
    case KErrorCode.NotImplemented: return String(t("ErrorNotImplemented"));
    case KErrorCode.TransactionError: return String(t("ErrorTransactionError"));
    case KErrorCode.InsufficientBalance: return String(t("ErrorInsufficientBalance"));
    case KErrorCode.InsufficientMaximumBalance: return String(t("ErrorInsufficientMaximumBalance"));
    case KErrorCode.NoTrustPath: return String(t("ErrorNoTrustPath"));
    case KErrorCode.InvalidPassword: return String(t("ErrorInvalidPassword"));
    case KErrorCode.DuplicatedEmail: return String(t("ErrorDuplicatedEmail"));
    case KErrorCode.BadRequest: return String(t("ErrorBadRequest"));
    case KErrorCode.UnknownServer: return String(t("ErrorUnknownServer"));
    case KErrorCode.Unknown: return String(t("ErrorUnknown"));
    case KErrorCode.IncorrectRequest: return String(t("ErrorIncorrectRequest"));
    case KErrorCode.ServerNoResponse: return String(t("ErrorServerNoResponse"));
    case KErrorCode.ServerBadResponse: return String(t("ErrorServerBadResponse"));
    case KErrorCode.ResourceNotFound: return String(t("ErrorResourceNotFound"));
    case KErrorCode.UnknownVueError: return String(t("ErrorUnknownVueError"));
    case KErrorCode.UnknownScript: return String(t("ErrorUnknownScript"));
    case KErrorCode.ErrorHandling: return String(t("ErrorErrorHandling"));
    case KErrorCode.PositionTimeout: return String(t("ErrorPositionTimeout"));
    case KErrorCode.PositionUnavailable: return String(t("ErrorPositionUnavailable"));
    case KErrorCode.PositionPermisionDenied: return String(t("ErrorPositionPermisionDenied"));
    case KErrorCode.NotificationsPermissionDenied: return String(t("ErrorNotificationsPermissionDenied"));
    case KErrorCode.VueWarning: return String(t("ErrorVueWarning"));
    case KErrorCode.IncorrectCredentials: return String(t("ErrorIncorrectCredentials"));
    case KErrorCode.AuthNoCredentials: return String(t("ErrorAuthNoCredentials"));
    case KErrorCode.RequestError: return String(t("ErrorRequestError"));
    case KErrorCode.InvalidTransferState: return String(t("ErrorInvalidTransferState"));
    case KErrorCode.InvalidTransfersCSVFile: return String(t("ErrorInvalidTransfersCSVFile"));
    case KErrorCode.QRCodeError: return String(t("ErrorQRCodeError"));
    case KErrorCode.NFCReadError: return String(t("ErrorNFCReadError"));
    case KErrorCode.NFCUnavailable: return String(t("ErrorNFCUnavailable"));
    case KErrorCode.ExternalPaymentNotAllowed: return String(t("ErrorExternalPaymentNotAllowed"));
    case KErrorCode.InvalidAmount: return String(t("ErrorInvalidAmount"));
    case KErrorCode.DescriptionRequired: return String(t("ErrorDescriptionRequired"));
    case KErrorCode.AccountNotFound: return String(t("ErrorAccountNotFound"));
    case KErrorCode.AccountIsNotYours: return String(t("ErrorAccountIsNotYours"));
    case KErrorCode.CamNotAllowed: return String(t("ErrorCamNotAllowed"));
    case KErrorCode.CamNotFound: return String(t("ErrorCamNotFound"));
    case KErrorCode.CamNotReadable: return String(t("ErrorCamNotReadable"));
    case KErrorCode.CamUnknown: return String(t("ErrorCamUnknown"));
    case KErrorCode.ScriptError: return String(t("ErrorScriptError"));
    default: return String(t("ErrorUnknown"));
  }
}
