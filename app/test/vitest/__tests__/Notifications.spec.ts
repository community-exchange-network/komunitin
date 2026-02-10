import { type VueWrapper } from "@vue/test-utils";
import App from "src/App.vue";
import { mountComponent, waitFor } from "../utils";
import { seeds } from "src/server";
import { QBadge, QMenu } from "quasar";
import ProfileBtnMenu from "src/components/ProfileBtnMenu.vue";
import NotificationsMenuItem from "src/components/NotificationsMenuItem.vue";
import NotificationItem from "src/pages/user/NotificationItem.vue";

describe("Notifications", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("shows unread badge in profile menu", async () => {
    // Navigate to home (a rootPage) so ProfileBtnMenu renders.
    await wrapper.vm.$router.push("/home");
    await waitFor(() => wrapper.vm.$route.path === "/home");

    // Open profile menu.
    const profileButton = wrapper.findComponent(ProfileBtnMenu);
    await profileButton.trigger("click");
    await wrapper.vm.$nextTick();

    const profileMenu = wrapper.getComponent(QMenu);
    expect(profileMenu.isVisible()).toBe(true);

    // Find the notifications menu item inside the menu.
    const notificationsMenuItem = profileMenu.findComponent(NotificationsMenuItem);
    expect(notificationsMenuItem.exists()).toBe(true);

    // Badge should be visible with the unread count (3 unread in seed data).
    const badge = notificationsMenuItem.findComponent(QBadge);
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe("3");
  });

  it("navigates to notifications page and shows items", async () => {
    await wrapper.vm.$router.push("/notifications");
    await waitFor(() => wrapper.vm.$route.path === "/notifications");

    // Should display notification items.
    await waitFor(() => wrapper.findComponent(NotificationItem).exists(), true, "Notification items should render");  
    const items = wrapper.findAllComponents(NotificationItem);
    expect(items.length).toBe(5);

    // Check that we have unread notifications (title has class "text-weight-bold")
    const unreadItems = items.filter(item => item.classes("bg-active"));
    expect(unreadItems.length).toBe(3);
    
    const text = wrapper.text();
    // Just check that we see some notification content rendered.
    expect(text.length).toBeGreaterThan(0);
  });

  it("marks all as read after visiting notifications page", async () => {
    // The Notifications page marks all as read after a while.
    const items = wrapper.findAllComponents(NotificationItem);
    await waitFor(() => items.filter(item => item.classes("bg-active")).length, 0, "All notifications should be marked as read")  

    // After marking all read, unread count should be 0.
    const unreadCount = wrapper.vm.$store.getters["notifications/unreadCount"];
    expect(unreadCount).toBe(0);

    // Re-open profile menu to verify badge is gone.
    await wrapper.vm.$router.push("/home");
    await waitFor(() => wrapper.vm.$route.path === "/home");

    const profileButton = wrapper.findComponent(ProfileBtnMenu);
    await profileButton.trigger("click");
    await wrapper.vm.$nextTick();

    const profileMenu = wrapper.getComponent(QMenu);
    const notificationsMenuItem = profileMenu.findComponent(NotificationsMenuItem);
    const badge = notificationsMenuItem.findComponent(QBadge);
    expect(badge.exists()).toBe(false);
  });
});
