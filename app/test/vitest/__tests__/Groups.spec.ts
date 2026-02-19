 
import { flushPromises, VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { LMarker } from '@vue-leaflet/vue-leaflet';
import { mountComponent, waitFor } from "../utils";
import { QInnerLoading, QCard } from "quasar";
import SimpleMap from '../../../src/components/SimpleMap.vue';
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

  it ("Renders group page", async () => {
    await wrapper.vm.$router.push("/groups/GRP0");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    // await waitFor(() => wrapper.text().includes("6 Computers"), true, "Group page should load offer categories");
    const text = wrapper.text();
    // Title
    expect(text).toContain("Group 0");
    // Code
    expect(text).toContain("GRP0");
    // Description
    expect(text).toContain("Et facere placeat molestiae");
    // Check cards present.
    const cards = wrapper.findAllComponents(QCard);
    cards.forEach((card) => {
      const isMembersCard = card.text().includes("Members") || false;
      const isStatsCard = card.text().includes("Statistics") || false;
      const isMapCard = card.findComponent(SimpleMap)?.exists();
      expect(isMembersCard || isStatsCard || isMapCard).toBe(true);
    });
    // FIXME: Members should not show on map, only group center
    // expect(wrapper.findAllComponents({ name: 'LMarker' }).length).toEqual(1);
    // Location
    expect(text).toContain("Buckinghamshire");
    // Contact
    expect(text).toContain("363-958-4365");
    expect(text).toContain("Kaci.Donnelly31@yahoo.com");
    expect(text).toContain("Amir_Mann");
    expect(text).toContain("186-667-337");
  });

  it("Renders group members on map if logged in", async () => {
    // Log in 'manually'
    await wrapper.vm.$router.push("/login-mail");
    await waitFor(() => wrapper.vm.$route.path, "/login-mail");
    await wrapper.get("input[type='email']").setValue("example@example.com");
    await wrapper.get("input[type='password']").setValue("password");
    await wrapper.vm.$nextTick();
    await wrapper.get("button[type='submit']").trigger("click");
    await waitFor(() => wrapper.vm.$store.getters.isLoggedIn, true, "User should be logged in");
    await wrapper.vm.$router.push("/groups/GRP0");
    await flushPromises();
    await wrapper.vm.$nextTick();
    // FIXME: Members should show on map
    // expect(wrapper.findAllComponents({ name: 'LMarker' }).length).toEqual(30);
  });
});