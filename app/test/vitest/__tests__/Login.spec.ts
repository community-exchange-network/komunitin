import type { VueWrapper } from "@vue/test-utils";
import { QList, QMenu } from "quasar";
import ProfileBtnMenu from 'src/components/ProfileBtnMenu.vue';
import server, { seeds } from "src/server";
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
    await waitFor(() => wrapper.text().includes("explore"), true, "Initial front page should load");
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

  it.each(["success", "failure", "logout"])("keeps delayed bootstrap private: %s", async outcome => {
    const store = wrapper.vm.$store
    await store.dispatch("logout")
    await wrapper.vm.$router.push("/login-mail")
    const accounts = Object.values(store.state.accounts.resources)
    const currencies = Object.values(store.state.currencies.resources)
    for (const id of Object.keys(store.state.accounts.resources)) {
      store.commit("accounts/removeResource", id)
    }
    for (const id of Object.keys(store.state.currencies.resources)) {
      store.commit("currencies/removeResource", id)
    }

    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    let requested = false
    const fetch = globalThis.fetch
    const delayedFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (String(url).includes("/accounts/")) {
        requested = true
        await pending
        if (outcome === "failure") {
          return new Response(JSON.stringify({ errors: [{ code: "NotFound" }] }), { status: 404 })
        }
      }
      return fetch(url, options)
    })
    const login = store.dispatch("login", { email: "example@example.com", password: "password" })
      .catch(error => error)
    try {
      await waitFor(() => requested, true)
      expect(store.getters.isLoggedIn).toBe(false)
      expect(store.getters.myMember).toBeUndefined()
      expect(wrapper.find("input[type='email']").exists()).toBe(true)
      if (outcome === "logout") {
        await store.dispatch("logout")
      }
      release()
      await login
      expect(store.getters.isLoggedIn).toBe(outcome === "success")
      if (outcome === "success") {
        expect(store.getters.myCurrency.attributes.code).toBeDefined()
        await wrapper.vm.$router.push("/home")
        await waitFor(() => wrapper.vm.$route.path, "/home")
      }
    } finally {
      release()
      delayedFetch.mockRestore()
      store.commit("accounts/addResources", accounts)
      store.commit("currencies/addResources", currencies)
    }
    if (outcome === "failure") {
      await store.dispatch("login", { email: "example@example.com", password: "password" })
      expect(store.getters.isLoggedIn).toBe(true)
    }
    await wrapper.vm.$router.push("/logout")
    await waitFor(() => wrapper.vm.$route.path, "/")
  })

  it("keeps the newer session when an older authorization finishes late", async () => {
    const store = wrapper.vm.$store
    await testLogin()
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    let delayed = false
    const fetch = globalThis.fetch
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (!delayed && String(url).includes("/accounts/")) {
        delayed = true
        await pending
      }
      return fetch(url, options)
    })
    const older = store.dispatch("authorize", { force: true }).catch(error => error)
    try {
      await waitFor(() => delayed, true)
      await store.dispatch("authorize", { force: true })
      expect(store.getters.isLoggedIn).toBe(true)
      release()
      await older
      expect(store.getters.isLoggedIn).toBe(true)
    } finally {
      release()
      fetchSpy.mockRestore()
      await wrapper.vm.$router.push("/logout")
      await waitFor(() => wrapper.vm.$route.path, "/")
    }
  })

  it("superadmin login", async () => {
    server.schema.users.first().update({ language: undefined });

    await wrapper.vm.$router.push("/superadmin/groups");
    await waitFor(() => wrapper.vm.$route.path, "/login-mail");
    await wrapper.get("input[type='email']").setValue("superadmin@example.com");
    await wrapper.get("input[type='password']").setValue("password");
    await wrapper.get("button[type='submit']").trigger("click");

    await waitFor(() => wrapper.vm.$store.getters.isSuperadmin, true);
    await waitFor(() => wrapper.vm.$route.path, "/superadmin/groups");

    await wrapper.vm.$router.push("/groups/GRP0/admin/settings");
    await waitFor(() => wrapper.text().includes("Community Settings"), true, "Community settings title should be translated");

    await wrapper.vm.$router.push("/logout");
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
    expect(wrapper.vm.$store.getters.isSuperadmin).toBe(false);
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
    await testLogin();
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
