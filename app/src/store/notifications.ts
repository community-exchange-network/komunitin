import type { ActionContext } from "vuex";
import type { CollectionResponseInclude, Notification, ResourceObject } from "./model";
import { Resources, type ResourcesState } from "./resources";
import { apiRequest } from "./request";

/**
 * Extended state for the notifications module, adding unread count.
 */
export interface NotificationResourcesState extends ResourcesState<Notification> {
  unreadCount: number;
}

/**
 * Custom Resources subclass for the notifications module.
 * 
 * Extends the generic Resources class with:
 * - `unreadCount` in state, populated from the API's `meta.unread` field
 * - `markAllRead` action to mark all notifications as read via POST endpoint
 */
export class NotificationResources extends Resources<Notification, unknown> {
  constructor(type: string, baseUrl: string) {
    super(type, baseUrl);

    // Extend state with unreadCount
    (this.state as NotificationResourcesState).unreadCount = 0;

    // Add unreadCount getter
    (this.getters as Record<string, unknown>).unreadCount = 
      (state: NotificationResourcesState) => state.unreadCount;

    // Add unreadCount mutation
    (this.mutations as Record<string, unknown>).unreadCount = 
      (state: NotificationResourcesState, count: number) => {
        state.unreadCount = count;
      };

    // Add markAllRead action
    (this.actions as Record<string, unknown>).markAllRead = 
      (context: ActionContext<NotificationResourcesState, unknown>, payload: { group: string }) =>
        this.markAllRead(context, payload);
  }

  /**
   * Override handleCollectionResponse to capture meta.unread from the API response.
   */
  protected async handleCollectionResponse(
    data: CollectionResponseInclude<Notification, ResourceObject>,
    context: ActionContext<ResourcesState<Notification>, unknown>,
    key: string,
    page: number,
    onlyResources?: boolean
  ) {
    // Extract unread count from meta before passing to parent
    const meta = (data as unknown as { meta?: { unread?: number } })?.meta;
    if (meta?.unread !== undefined) {
      context.commit("unreadCount", meta.unread);
    }

    return super.handleCollectionResponse(data, context, key, page, onlyResources);
  }

  /**
   * Mark all notifications as read for the given group.
   * POSTs to /:code/notifications/read and updates local state.
   */
  private async markAllRead(
    context: ActionContext<NotificationResourcesState, unknown>,
    payload: { group: string }
  ) {
    const url = this.baseUrl + `/${payload.group}/notifications/read`;

    await apiRequest(context, url, "post");

    // Update local state: mark all cached notifications as read
    const resources = context.state.resources;
    const now = new Date().toISOString();
    for (const id of Object.keys(resources)) {
      const notification = resources[id];
      if (notification && !notification.attributes.read) {
        context.commit("addResource", {
          ...notification,
          attributes: {
            ...notification.attributes,
            read: now,
          },
        });
      }
    }

    // Reset unread count
    context.commit("unreadCount", 0);
  }
}
