import type { ComponentPublicInstance } from 'vue';

import KError, { KErrorCode } from '../KError';
import { Notify } from 'quasar'
import { boot } from 'quasar/wrappers';
import {i18n} from './i18n'


/**
 * Get the localized message for the error.
 * 
 * @param error The error.
 */
function getLocalizedMessage(error: KError): string {
  const {t} = i18n.global
  return t(error.getTranslationKey()).toString();
}


const lastError: Record<string, number> = {}
/**
 * Show error to the user.
 * 
 * @param error The error to be shown.
 */
function showError(error: KError) {
  // Sometimes, specially during development, we dont want the UI to continually
  // show the same error message. We show these errors ony once every 5 min. 
  const showOnceErrors = [KErrorCode.VueWarning,
    KErrorCode.Unknown, KErrorCode.UnknownVueError, KErrorCode.UnknownScript, 
    KErrorCode.ErrorHandling, KErrorCode.NotificationsPermissionDenied, 
    KErrorCode.ScriptError
  ]
  if (!showOnceErrors.includes(error.code as KErrorCode) || lastError[error.code] === undefined || Date.now() - lastError[error.code] > 1000*60*5) {
    lastError[error.code] = Date.now()
    Notify.create({
      color: 'negative',
      position: 'top',
      message: getLocalizedMessage(error),
      actions: [
        { icon: 'close', color: 'white', round: true }
      ]
    });
  }
}

/**
 * Write an error line to the JavaScript console.
 * 
 * @param error The error to be logged.
 */
function logError(error: KError) {
  let msg = `[${error.code}] ${error.message}`;
  if (error.debugInfo) {
    try {
      msg += "\n" + JSON.stringify(error.debugInfo)
    } catch {
      msg += "\n" + "Error while serializing debug info."
    }
  }
   
  console.error(msg);
   
  console.error(error);
}

/**
 * Log error produced while trying to handle the error. 
 */
function logErrorHandling(error: Error) {
   
  console.error(`[${KErrorCode.ErrorHandling}] Error while handling another error: ${error.message}`);
}

export function handleError(error: KError): void {
  logError(error);
  showError(error);
}

function vueErrorHandler(error: unknown, instance: ComponentPublicInstance | null, info: string) {
  if (error instanceof KError) {
    handleError(error)
  } else if (error instanceof Error || (('message' in (error as Error))  && ('stack' in (error as Error)))) {
    handleError(new KError(KErrorCode.UnknownVueError, (error as Error).message, error as Error, {info}))
  } else {
    handleError(new KError(KErrorCode.UnknownVueError, "Unknown error", undefined, {error, info}))
  }
}
function vueWarnHandler(message: string, instance: ComponentPublicInstance | null, trace: string) {
  const error = new KError(KErrorCode.VueWarning, message + trace, undefined, {message, trace, component: instance?.$options.name});
  handleError(error);
}

/**
 * Register global error handler for errors occurred outside Vue components. 
 */
if (window !== undefined) {
  window.addEventListener('error', function(event: ErrorEvent) {
    // This error is thrown but is harmless, so we can safely ignore it.
    // In fact, it is mandatory that we ignore it since otherwise we show
    // very annoying error messages to users. Note that in chrome this 
    // error is 
    // "ResizeObserver loop limit exceeded" 
    // and  in Safari it is:
    // "ResizeObserver loop completed with undelivered notifications."
    // furthermore, safari may hide the error details from the script, just giving "Script error"
    if (event.message.includes("ResizeObserver loop") || event.message == "Script error.") {
      // TODO: Maybe remove this warning in production.
      if (process.env.DEV) {
         
        console.warn(event.message);
      }
      return;
    }
    let kerror: KError;
    if (event.error instanceof KError) {
      kerror = event.error;
    }
    else {
      kerror = new KError(KErrorCode.UnknownScript, event.message, event.error, {url: event.filename , line: event.lineno, column: event.colno})
    }
    try {
      handleError(kerror);
    }
    catch {
      logErrorHandling(kerror);
    }
  });
}

export default boot(({app}) => {
  // Add handleError() function to Vue prototype.
  app.config.globalProperties.$handleError = handleError;
  // Set Vue warning handler.
  app.config.warnHandler = vueWarnHandler;
  app.config.errorHandler = vueErrorHandler;
});

declare module "vue" {
  interface ComponentCustomProperties {
    /**
     * Main function for error handling.
     * 
     * Use this function when you can continue the execution but you want to log the error anyway. Otherwise
     * just throw the KError.
     * 
     * @param error The error to handle
     */
    $handleError: (error: KError) => void;
  }
}