import type { VueWrapper } from "@vue/test-utils";
import { QList, QMenu } from "quasar";
import ProfileBtnMenu from 'src/components/ProfileBtnMenu.vue';
import { seeds } from "src/server";
import App from "../../../src/App.vue";
import { mountComponent, testLogin, waitFor } from "../utils";

const mockUnsubscribe = vi.fn(() => Promise.resolve());

vi.mock("src/plugins/Notifications", async () => {
  const actual = await vi.importActual("../../../src/plugins/Notifications");
  return {
    ...actual,
    unsubscribe: () => mockUnsubscribe(),
  };
});

describe("Front page and login", () => {
  let wrapper: VueWrapper;
  beforeAll(async () => {
    wrapper = await mountComponent(App);
    seeds();
    // Wait for lazy-loaded route components to load.
    await waitFor(() => wrapper.text().includes("explore"), true, "Initial front page should load");1
  });
  afterAll(() => wrapper.unmount());
  beforeEach(() => {
    mockUnsubscribe.mockReset();
  });

  it("has explore and login buttons", () => {
    const html = wrapper.html();
    expect(html).toContain("account_circle");
    expect(html).toContain("explore");
  });

  it("goes to login with mail and back to front page", async () => {
    expect(wrapper.vm.$route.path).toBe("/");
    expect(wrapper.find("#back").isVisible()).toBe(false);
    // Click login button.
    await wrapper.get("#login").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/login-mail");
    // Click back
    expect(wrapper.get("#back").isVisible()).toBe(true);
    // Click back again
    expect(wrapper.get("#back").isVisible()).toBe(true);
    await wrapper.get("#back").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/");
  });

  it("login and logout", async () => {
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
    // Go to login with mail page.
    await wrapper.vm.$router.push("/login-mail");
    await waitFor(() => wrapper.vm.$route.path, "/login-mail");
    await waitFor(() => wrapper.find("button[type='submit']").exists(), true, "Login form should render");
    // Button is disabled since form is empty.
    expect(wrapper.get("button[type='submit']").attributes("disabled"))
      .toBeDefined();
    await wrapper.get("input[type='email']").setValue("example@example.com");
    await wrapper.get("input[type='password']").setValue("password");
    await wrapper.vm.$nextTick();
    // Button is enabled now.
    expect(
      wrapper.get("button[type='submit']").attributes("disabled")
    ).toBeUndefined();
    await wrapper.get("button[type='submit']").trigger("click");
    await waitFor(() => wrapper.vm.$store.getters.isLoggedIn, true, "User should be logged in");
    await waitFor(() => wrapper.vm.$route.path, "/home");
    // Open profile menu
    await wrapper.findComponent(ProfileBtnMenu).trigger('click');
    await wrapper.vm.$nextTick();
    // Click logout (be careful with teleports when finding the element)
    await wrapper
      .getComponent(QMenu)
      .getComponent(QList)
      .get("#user-menu-logout")
      .trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/");
  });

  it("lag in unsubscription should not block logout", async() => {
    // Mock the browser unsubscribe() to take a long time.
    mockUnsubscribe.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));
    testLogin();
    // logout
    await wrapper.vm.$router.push("/logout");
    // after 1 sec it should still be logging out, since the unsubscription is taking a long time.
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(wrapper.vm.$route.path).toBe("/logout");
    // But after additional 1.5 sec max, it should complete logout.
    await waitFor(() => wrapper.vm.$route.path === "/", true, "Should navigate back to front page after logout", 1500)
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
  })
  
});
