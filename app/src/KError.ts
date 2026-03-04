import type { ErrorResponse } from "./store/model";

/**
 * Single source of truth for error codes and their translation keys.
 * 
 * To add a new error code, add an entry here and add the corresponding
 * translation to all locale files under src/i18n. That's it — the
 * KErrorCode type is derived from this record automatically.
 */
export const errorTranslationKeys = {
  // Shared server errors codes.
  Unauthorized: 'ErrorUnauthorized',
  Forbidden: 'ErrorForbidden',
  NotFound: 'ErrorNotFound',
  NotImplemented: 'ErrorNotImplemented',

  // Accounting service error codes.
  TransactionError: 'ErrorTransactionError',
  InsufficientBalance: 'ErrorInsufficientBalance',
  InsufficientMaximumBalance: 'ErrorInsufficientMaximumBalance',
  NoTrustPath: 'ErrorNoTrustPath',

  // Social service error codes.
  InvalidPassword: 'ErrorInvalidPassword',
  DuplicatedEmail: 'ErrorDuplicatedEmail',
  BadRequest: 'ErrorBadRequest',

  // There are more server errors but we're not identifying them and
  // they are all piped to UnknownServer.
  UnknownServer: 'ErrorUnknownServer',

  // Client errors codes.
  Unknown: 'ErrorUnknown',
  IncorrectRequest: 'ErrorIncorrectRequest',
  ServerNoResponse: 'ErrorServerNoResponse',
  ServerBadResponse: 'ErrorServerBadResponse',
  ResourceNotFound: 'ErrorResourceNotFound',
  UnknownVueError: 'ErrorUnknownVueError',
  UnknownScript: 'ErrorUnknownScript',
  ErrorHandling: 'ErrorErrorHandling',
  PositionTimeout: 'ErrorPositionTimeout',
  PositionUnavailable: 'ErrorPositionUnavailable',
  PositionPermisionDenied: 'ErrorPositionPermisionDenied',
  NotificationsPermissionDenied: 'ErrorNotificationsPermissionDenied',
  VueWarning: 'ErrorVueWarning',
  IncorrectCredentials: 'ErrorIncorrectCredentials',
  AuthNoCredentials: 'ErrorAuthNoCredentials',
  RequestError: 'ErrorRequestError',
  InvalidTransferState: 'ErrorInvalidTransferState',
  InvalidTransfersCSVFile: 'ErrorInvalidTransfersCSVFile',
  QRCodeError: 'ErrorQRCodeError',
  NFCReadError: 'ErrorNFCReadError',
  NFCUnavailable: 'ErrorNFCUnavailable',
  ExternalPaymentNotAllowed: 'ErrorExternalPaymentNotAllowed',
  InvalidAmount: 'ErrorInvalidAmount',
  DescriptionRequired: 'ErrorDescriptionRequired',
  AccountNotFound: 'ErrorAccountNotFound',
  AccountIsNotYours: 'ErrorAccountIsNotYours',
  CamNotAllowed: 'ErrorCamNotAllowed',
  CamNotFound: 'ErrorCamNotFound',
  CamNotReadable: 'ErrorCamNotReadable',
  CamUnknown: 'ErrorCamUnknown',

  // This condition should not happen and it indicates a programming bug
  // that needs to be solved by the development team. Use it to assert complex
  // conditions.
  ScriptError: 'ErrorScriptError',
} as const satisfies Record<string, string>

/** Error code type — derived from the errorTranslationKeys keys. */
export type KErrorCode = keyof typeof errorTranslationKeys

/** Runtime KErrorCode values. Use as KErrorCode.Unauthorized, etc. */
export const KErrorCode: { readonly [K in KErrorCode]: K } = Object.fromEntries(
  Object.keys(errorTranslationKeys).map(k => [k, k])
) as { readonly [K in KErrorCode]: K }

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
