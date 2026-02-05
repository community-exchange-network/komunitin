/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope

const NotificationActions = {
  OPEN_ROUTE: 'open_route',
  OPEN_ROUTE_2: 'open_route_2',
  EXTEND_POST: 'extend_post',
  HIDE_POST: 'hide_post',
}

export const runAction = async (event: NotificationEvent): Promise<void> => {
  if (event.action === NotificationActions.OPEN_ROUTE_2) {
    return openNotificationRoute(event.notification.data?.route2);
  } else if (event.action === NotificationActions.EXTEND_POST) {
    // For extend post, perform the action directly through the edit post route
    const editRoute = event.notification.data.route as string;
    const route = `${editRoute}?expires=${event.notification.data.extendTo}`;
    return openNotificationRoute(route);
  } else if (event.action === NotificationActions.HIDE_POST) {
    // For hide post, perform the action directly through the edit post route
    const editRoute = event.notification.data.route as string;
    const route = `${editRoute}?state=hidden`;
    return openNotificationRoute(route);
  } else {
    return openNotificationRoute(event.notification.data?.route);
  }
}

export const openNotificationRoute = async (route?: string): Promise<void> => {
  const url = new URL(route ?? "/", self.location.origin).toString()

  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  })

  const targetOrigin = new URL(url).origin
  const match = windowClients.find(c => c.visibilityState === 'visible' && new URL(c.url).origin === targetOrigin) 
    || windowClients.find(c => new URL(c.url).origin === targetOrigin)

  if (match) {
    await match.focus()
    if (match.url !== url) {
      await match.navigate(url)
    }
  } else {
    await self.clients.openWindow(url)
  }
}
