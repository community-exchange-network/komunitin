import { describe, expect, it, beforeAll, afterAll } from 'vitest';
 
import { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
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
    await wrapper.vm.$wait();
    expect(wrapper.findAllComponents(GroupCard).length).toBe(7);
    expect((wrapper.findComponent(QInnerLoading).vm as QInnerLoading).showing).toBe(false);
  });

  it ("Render group page", async () => {
    await wrapper.vm.$router.push("/groups/GRP0");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    await wrapper.vm.$wait();
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
    expect(text).toContain("Currency");
    expect(text).toContain("$");
    // Location
    expect(text).toContain("Buckinghamshire");
    // Contact
    expect(text).toContain("363-958-4365");
    expect(text).toContain("Kaci.Donnelly31@yahoo.com");
    expect(text).toContain("Amir_Mann");
    expect(text).toContain("186-667-337");
  })
});