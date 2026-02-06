import { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
import { seeds } from "../../../src/server";

describe("Explore groups", () => {
  let wrapper: VueWrapper;
  beforeAll(async() => {
    // Load data in mocking server.
    wrapper = await mountComponent(App);
    seeds();
    // Wait for lazy-loaded route components to load
    await wrapper.vm.$wait();
  });

  afterAll(() => wrapper.unmount());

  it("goes to explore group and back to front page", async () => {
    await wrapper.vm.$router.push("/groups");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups");
    const list = wrapper.text();
    expect(list).toContain("GRP1");
    expect(list).toContain("GRP6");
    wrapper.get("[href='/groups/GRP1']").trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups/GRP1");
    const group = wrapper.text();
    expect(group).toContain("GRP1");
    // Check cards present.
    expect(group).toContain("Offers");
    expect(group).toContain("Needs");
    expect(group).toContain("Members");
    expect(group).toContain("Currency");
    // Go back home
    wrapper.get("#back").trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups");
    wrapper.get("#back").trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/");
  });
});
