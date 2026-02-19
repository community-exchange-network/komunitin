import { VueWrapper } from "@vue/test-utils";
import {
  QCard,
} from "quasar";
import App from "../../../src/App.vue";
import SimpleMap from '../../../src/components/SimpleMap.vue';
import { mountComponent, waitFor } from "../utils";
import { seeds } from "../../../src/server";

describe("Explore groups", () => {
  let wrapper: VueWrapper;
  beforeAll(async() => {
    // Load data in mocking server.
    wrapper = await mountComponent(App);
    seeds();
    // Wait for lazy-loaded route components to load.
    await waitFor(() => wrapper.text().includes("explore"), true, "Initial front page should load");
  });

  afterAll(() => wrapper.unmount());

  it("goes to explore group and back to front page", async () => {
    // Click the explore button (UI-based navigation).
    await wrapper.get("#explore").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups");
    await waitFor(() => wrapper.text().includes("GRP1"), true, "Group list should load");
    const list = wrapper.text();
    expect(list).toContain("GRP1");
    expect(list).toContain("GRP6");
    await wrapper.get("[href='/groups/GRP1']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP1");
    const group = wrapper.text();
    expect(group).toContain("GRP1");
    // Check cards present.
    const cards = wrapper.findAllComponents(QCard);
    cards.forEach((card) => {
      const isMembersCard = card.text().includes("Members") || false;
      const isStatsCard = card.text().includes("Statistics") || false;
      const isMapCard = card.findComponent(SimpleMap)?.exists()
      expect(isMembersCard || isStatsCard || isMapCard).toBe(true);
    });
    // Go back home
    await wrapper.get("#back").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups");
    await wrapper.get("#back").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/");
  });
});
