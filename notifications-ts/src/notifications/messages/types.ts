import { i18n } from 'i18next';

/**
 * Context provided to message builders for localization
 */
export interface MessageContext {
  t: ReturnType<i18n['getFixedT']>;
  locale: string;
}

export const NotificationActions = {
  DEFAULT: 'default',
} as const;

export type NotificationAction = typeof NotificationActions[keyof typeof NotificationActions]

/**
 * Action button for notification message. The actual action handling is
 * implemented on the client side based on the action string.
 */
export interface NotificationMessageAction {
  title: string;
  action: NotificationAction;
}

/**
 * Generated notification message
 */
export interface NotificationMessage {
  title: string;
  body: string;
  image: string | undefined;
  route: string;
  // Optional action buttons for the notification
  actions?: NotificationMessageAction[];
  // Optional additional data for the notification
  data?: Record<string, unknown>;
}
