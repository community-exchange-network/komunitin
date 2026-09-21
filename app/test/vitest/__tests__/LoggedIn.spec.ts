import { VueWrapper } from "@vue/test-utils";
import { seeds } from "@/server";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";

describe("logged in", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it.each(['/', '/login'])("redirects from %s when logged in", async (path) => {
    const router = wrapper.vm.$router;
    await router.isReady();
    // Router guards are installed after router has its initial push in test environment. 
    // Leave the initial root route so navigating back executes the guard.
    await router.push('/home')
    await router.push(path)
    await waitFor(() => wrapper.vm.$route.path, "/home");
    expect(wrapper.vm.$route.path).toBe("/home");
    
    const text = wrapper.text();
    // Page title
    expect(text).toContain("Home");
    // Group name
    expect(text).toContain("Group 0");
  })

  it('honors the redirect query on the root page', async () => {
    await wrapper.vm.$router.push('/?redirect=/settings');
    await waitFor(() => wrapper.vm.$route.path, '/settings');
  });
});
