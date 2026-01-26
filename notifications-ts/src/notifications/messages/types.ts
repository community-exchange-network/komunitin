import { i18n } from 'i18next';

/**
 * Context provided to message builders for localization
 */
export interface MessageContext {
  t: ReturnType<i18n['getFixedT']>;
  locale: string;
}

/**
 * Generated notification message
 */
export interface NotificationMessage {
  title: string;
  body: string;
  image: string | undefined;
  route: string;
}
