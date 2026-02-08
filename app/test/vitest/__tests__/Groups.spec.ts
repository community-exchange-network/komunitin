 
import { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import { QInnerLoading } from "quasar";
import GroupCard from "../../../src/components/GroupCard.vue";
import { seeds } from "../../../src/server";

// See also Offers.spec.ts
describe("Groups", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    wrapper = await mountComponent(App);
    seeds();
  });
  afterAll(() => wrapper.unmount());

  it("Loads groups", async () => {
    await wrapper.vm.$router.push("/groups");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    // Load.
    await waitFor(() => wrapper.findAllComponents(GroupCard).length, 7, "Should load 7 groups");
    expect((wrapper.findComponent(QInnerLoading).vm as QInnerLoading).showing).toBe(false);
  });

  it ("Render group page", async () => {
    await wrapper.vm.$router.push("/groups/GRP0");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    await waitFor(() => wrapper.text().includes("6 Computers"), true, "Group page should load offer categories");
    const text = wrapper.text();
    // Title
    expect(text).toContain("Group 0");
    // Code
    expect(text).toContain("GRP0");
    // Description
    expect(text).toContain("Et facere placeat molestiae");
    // URL
    expect(text).toContain("rae.name");
    // Offers card
    expect(text).toContain("Offers");
    expect(text).toContain("30");
    expect(text).toContain("6 Computers");
    // Needs card
    expect(text).toContain("Needs");
    expect(text).toContain("4");
    expect(text).toContain("1 Computers");
    // Members card
    expect(text).toContain("Members");
    expect(text).toContain("31");
    expect(text).toContain("Explore");
    // Currency card
    await waitFor(() => wrapper.text().includes("Currency") && wrapper.text().includes("$"), true, "Group page should load currency");
    // Location
    expect(text).toContain("Buckinghamshire");
    // Contact
    expect(text).toContain("363-958-4365");
    expect(text).toContain("Kaci.Donnelly31@yahoo.com");
    expect(text).toContain("Amir_Mann");
    expect(text).toContain("186-667-337");
  })
});