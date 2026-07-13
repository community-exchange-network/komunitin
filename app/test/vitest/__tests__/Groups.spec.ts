 
import type { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, requireText, requireTextExcerpt, waitFor } from "../utils";
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

  it("Renders group page", async () => {
    await wrapper.vm.$router.push("/groups/GRP0");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    await waitFor(() => (wrapper.findComponent(QInnerLoading).vm as QInnerLoading).showing, false, "Should finish loading");
    const text = wrapper.text();
    // Title
    expect(text).toContain("Group 0");
    // Code
    expect(text).toContain("GRP0");
    const group = wrapper.vm.$store.getters["groups/find"]({ code: "GRP0" });
    const description = requireTextExcerpt(group.attributes.description, "Group description");
    expect(text).toContain(description);

    // Check cards present.
    const cards = wrapper.findAllComponents(QCard);
    cards.forEach((card) => {
      const isMembersCard = card.text().includes("Members") || false;
      const isStatsCard = card.text().includes("Statistics") || false;
      const isMapCard = card.findComponent(SimpleMap)?.exists();
      expect(isMembersCard || isStatsCard || isMapCard).toBe(true);
    });
    // Members should not show on map, only group center
    expect(wrapper.findAllComponents({ name: "LMarker" }).length).toEqual(1);
    // Location
    expect(text).toContain(requireText(group.attributes.location.name, "Group location"));
    expect(group.attributes.contacts).not.toHaveLength(0);
    group.attributes.contacts.forEach((contact: { value: string }) => {
      expect(text).toContain(requireText(contact.value, "Group contact"));
    });
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
    await waitFor(() => wrapper.vm.$route.path, "/home", "Login redirect should finish");
    
    await wrapper.vm.$router.push("/groups/GRP0");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0");
    await waitFor(() => wrapper.vm.$store.getters["members/currentList"]?.length === 31, true, "Api should finish loading");
    // The empty signup fixture has no location, so 30 of the 31 members are
    // passed to the map as bounds/markers.
    await waitFor(
      () => (wrapper.getComponent(SimpleMap).props("bounds") as unknown[])?.length,
      30,
      "Member markers should be passed to the map",
      10000
    );
  });
});
