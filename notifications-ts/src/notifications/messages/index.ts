/**
 * Shared message builders for notifications.
 * 
 * This module provides functions to generate localized notification messages
 * that can be used by different notification channels (in-app, push, email, etc).
 * 
 * Each builder function takes an enriched event and a message context (with i18n),
 * and returns a NotificationMessage with title, body, image, and route.
 */

export * from './types';
export * from './transfer';
export * from './post';
export * from './member';
