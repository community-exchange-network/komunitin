import { flushPromises, VueWrapper } from "@vue/test-utils";
import { seeds } from "src/server";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";

describe("logged in", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("redirects when logged in", async () => {
    const router = wrapper.vm.$router;
    await router.isReady();
    // Router guards are installed after router has its initial push in test environment. 
    // That's why we force a push so the guard is executed.
    router.push("/login")
    await flushPromises()
    await wrapper.vm.$wait()
    expect(wrapper.vm.$route.path).toBe("/home");
    
    const text = wrapper.text();
    // Member name
    expect(text).toContain("Emiliano Lemke");
    // Acount number
    expect(text).toContain("GRP00000");
    // Group name
    expect(text).toContain("Group 0");
  })
});