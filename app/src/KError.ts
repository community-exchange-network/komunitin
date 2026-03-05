import type { ErrorResponse } from "./store/model";

type TranslateFn = (key: string) => string

/**
 * Single source of truth for error codes and their user-facing messages.
 * 
 * Each key is an error code (and becomes a member of KErrorCode); each value
 * is a function that receives the i18n `t` helper and returns the translated
 * message using a **static** translation key so that linters and IDEs can
 * trace every key back to the locale files.
 * 
 * To add a new error, add one entry here and the matching key in every locale
 * file under src/i18n.
 */
export const errorMessages = {
  // Shared server errors codes.
  Unauthorized: (t: TranslateFn) => t('ErrorUnauthorized'),
  Forbidden: (t: TranslateFn) => t('ErrorForbidden'),
  NotFound: (t: TranslateFn) => t('ErrorNotFound'),
  NotImplemented: (t: TranslateFn) => t('ErrorNotImplemented'),

  // Accounting service error codes.
  TransactionError: (t: TranslateFn) => t('ErrorTransactionError'),
  InsufficientBalance: (t: TranslateFn) => t('ErrorInsufficientBalance'),
  InsufficientMaximumBalance: (t: TranslateFn) => t('ErrorInsufficientMaximumBalance'),
  NoTrustPath: (t: TranslateFn) => t('ErrorNoTrustPath'),

  // Social service error codes.
  InvalidPassword: (t: TranslateFn) => t('ErrorInvalidPassword'),
  DuplicatedEmail: (t: TranslateFn) => t('ErrorDuplicatedEmail'),
  BadRequest: (t: TranslateFn) => t('ErrorBadRequest'),

  // There are more server errors but we're not identifying them and
  // they are all piped to UnknownServer.
  UnknownServer: (t: TranslateFn) => t('ErrorUnknownServer'),

  // Client errors codes.
  Unknown: (t: TranslateFn) => t('ErrorUnknown'),
  IncorrectRequest: (t: TranslateFn) => t('ErrorIncorrectRequest'),
  ServerNoResponse: (t: TranslateFn) => t('ErrorServerNoResponse'),
  ServerBadResponse: (t: TranslateFn) => t('ErrorServerBadResponse'),
  ResourceNotFound: (t: TranslateFn) => t('ErrorResourceNotFound'),
  UnknownVueError: (t: TranslateFn) => t('ErrorUnknownVueError'),
  UnknownScript: (t: TranslateFn) => t('ErrorUnknownScript'),
  ErrorHandling: (t: TranslateFn) => t('ErrorErrorHandling'),
  PositionTimeout: (t: TranslateFn) => t('ErrorPositionTimeout'),
  PositionUnavailable: (t: TranslateFn) => t('ErrorPositionUnavailable'),
  PositionPermisionDenied: (t: TranslateFn) => t('ErrorPositionPermisionDenied'),
  NotificationsPermissionDenied: (t: TranslateFn) => t('ErrorNotificationsPermissionDenied'),
  VueWarning: (t: TranslateFn) => t('ErrorVueWarning'),
  IncorrectCredentials: (t: TranslateFn) => t('ErrorIncorrectCredentials'),
  AuthNoCredentials: (t: TranslateFn) => t('ErrorAuthNoCredentials'),
  RequestError: (t: TranslateFn) => t('ErrorRequestError'),
  InvalidTransferState: (t: TranslateFn) => t('ErrorInvalidTransferState'),
  InvalidTransfersCSVFile: (t: TranslateFn) => t('ErrorInvalidTransfersCSVFile'),
  QRCodeError: (t: TranslateFn) => t('ErrorQRCodeError'),
  NFCReadError: (t: TranslateFn) => t('ErrorNFCReadError'),
  NFCUnavailable: (t: TranslateFn) => t('ErrorNFCUnavailable'),
  ExternalPaymentNotAllowed: (t: TranslateFn) => t('ErrorExternalPaymentNotAllowed'),
  InvalidAmount: (t: TranslateFn) => t('ErrorInvalidAmount'),
  DescriptionRequired: (t: TranslateFn) => t('ErrorDescriptionRequired'),
  AccountNotFound: (t: TranslateFn) => t('ErrorAccountNotFound'),
  AccountIsNotYours: (t: TranslateFn) => t('ErrorAccountIsNotYours'),
  CamNotAllowed: (t: TranslateFn) => t('ErrorCamNotAllowed'),
  CamNotFound: (t: TranslateFn) => t('ErrorCamNotFound'),
  CamNotReadable: (t: TranslateFn) => t('ErrorCamNotReadable'),
  CamUnknown: (t: TranslateFn) => t('ErrorCamUnknown'),

  /**
   * This condition should not happen and it indicates a programming bug
   * that needs to be solved by the development team. Use it to assert complex
   * conditions.
   */
  ScriptError: (t: TranslateFn) => t('ErrorScriptError'),
} satisfies Record<string, (t: TranslateFn) => string>

/** Error code type — derived from the errorMessages keys. */
export type KErrorCode = keyof typeof errorMessages

/** Runtime KErrorCode values. Use as KErrorCode.Unauthorized, etc. */
export const KErrorCode: { readonly [K in KErrorCode]: K } = Object.fromEntries(
  Object.keys(errorMessages).map(k => [k, k])
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
