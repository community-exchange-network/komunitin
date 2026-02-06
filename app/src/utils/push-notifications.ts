/**
 * Shared push notification types and utilities
 * Used by both service worker (for native notifications) and main thread (for in-app notifications)
 */

/**
 * Push notification payload received from the backend
 */
export interface PushPayload {
  title: string
  body: string
  route: string
  code: string
  id: string
  actor?: string
  image?: string
  data?: {
    extendTo?: string
    route2?: string
  }
  actions?: {
    title: string
    action: string
  }[]
}

export const NotificationActions = {
  OPEN_ROUTE: 'open_route',
  OPEN_ROUTE_2: 'open_route_2',
  EXTEND_POST: 'extend_post',
  HIDE_POST: 'hide_post',
} as const

export type NotificationAction = typeof NotificationActions[keyof typeof NotificationActions]

export interface NotificationData {
  route: string
  route2?: string
  extendTo?: string
}

/**
 * Get the target route for a notification action
 */
export const getActionRoute = (action: string | undefined, data: NotificationData): string | undefined => {
  if (action === NotificationActions.OPEN_ROUTE_2) {
    return data.route2
  } else if (action === NotificationActions.EXTEND_POST) {
    const editRoute = data.route
    return `${editRoute}?expires=${data.extendTo}`
  } else if (action === NotificationActions.HIDE_POST) {
    const editRoute = data.route
    return `${editRoute}?state=hidden`
  } else {
    return data.route
  }
}
