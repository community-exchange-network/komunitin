import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
import { seeds } from "../../../src/server";

describe("Explore groups", () => {
  let wrapper: VueWrapper;
  beforeAll(async() => {
    // Load data in mocking server.
    const { waitFor } = await import("../utils");
    seeds();
    wrapper = await mountComponent(App);
    // Wait for the app to load - check if explore button exists
    await waitFor(() => wrapper.find("#explore").exists());
  });

  afterAll(() => wrapper.unmount());

  it("goes to explore group and back to front page", async () => {
    const { waitFor } = await import("../utils");
    wrapper.get("#explore").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups");
    // Wait for groups to load
    await waitFor(() => wrapper.text().includes("GRP1"));
    const list = wrapper.text();
    expect(list).toContain("GRP1");
    expect(list).toContain("GRP6");
    wrapper.get("[href='/groups/GRP1']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP1");
    // Wait for the group page to fully load with all cards
    await waitFor(() => wrapper.text().includes("Members"), true, 2000);
    const group = wrapper.text();
    expect(group).toContain("GRP1");
    // Check cards present.
    expect(group).toContain("Offers");
    expect(group).toContain("Needs");
    expect(group).toContain("Members");
    // Go back home
    wrapper.get("#back").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups");
    wrapper.get("#back").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/");
  });
});
