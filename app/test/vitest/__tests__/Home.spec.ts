import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { VueWrapper, flushPromises } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import {
  QInnerLoading,
  QToolbarTitle,
  QInfiniteScroll,
  QSelect,
  QItem,
} from "quasar";
import OfferCard from "../../../src/components/OfferCard.vue";
import PageHeader from "../../../src/layouts/PageHeader.vue";
import ApiSerializer from "src/server/ApiSerializer";
import { seeds } from "src/server";
import SelectCategory from "src/components/SelectCategory.vue";
import NeedCard from "src/components/NeedCard.vue";

describe("Home", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("redirects to home after login", async () => {
    await waitFor(() => wrapper.vm.$route.path === "/home");
    // Navigate to login page, to trigger redirect to home (when logged in)
    // (Redirect after 'manual' login is already tested in Login.spec.ts)
    await wrapper.vm.$router.push("/login");
    await waitFor(() => wrapper.vm.$route.path, "/home");
    expect(wrapper.vm.$route.path).toBe("/home");
    expect(wrapper.findComponent(QToolbarTitle).text()).toBe("Home");
  });

  it("loads offers and needs", async () => {
    await waitFor(() => wrapper.vm.$route.path === "/home");
    await wrapper.vm.$router.push("/home");
    await waitFor(() => wrapper.vm.$route.path, "/home");

    // Wait for offers and needs to load
    await waitFor(() => wrapper.vm.$store.getters["offers/currentList"].length > 0);
    await waitFor(() => wrapper.vm.$store.getters["needs/currentList"].length > 0);

    // Check if offers and needs are loaded
    expect(
      wrapper.vm.$store.getters["offers/currentList"].length
    ).toBeGreaterThan(0);
    expect(
      wrapper.vm.$store.getters["needs/currentList"].length
    ).toBeGreaterThan(0);

    // Check that both (and only) offer and need cards are rendered
    const cards = wrapper.findAllComponents(".q-card");
    cards.forEach((card) => {
      const isOfferCard = card.findComponent(OfferCard)?.exists() || false;
      const isNeedCard = card.findComponent(NeedCard)?.exists() || false;

      expect(isOfferCard || isNeedCard).toBe(true);
    });

    // trigger infinite-scroll
    (wrapper.findComponent(QInfiniteScroll).vm as QInfiniteScroll).trigger();
    await waitFor(() => wrapper.findAllComponents(".q-card").length > 21);
    expect(wrapper.findAllComponents(".q-card").length).toBeGreaterThan(21);
  });

  it("searches offers and needs", async () => {
    wrapper.getComponent(PageHeader).vm.$emit("search", "dolor");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAllComponents(OfferCard).length).toBe(0);
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    
    // Wait for search results to load
    await waitFor(() => wrapper.findAllComponents(OfferCard).length >= 20);

    // found 20 offers and 1 need
    expect(wrapper.findAllComponents(OfferCard).length).toBe(20);
    expect(wrapper.findAllComponents(NeedCard).length).toBe(1);
  });
  
  it('displays FAB', async () => {
    const fab = wrapper.get('.q-fab');
    expect(fab.text().includes('Create')).toBe(true);
    await fab.trigger('click');
    const actions = fab.findAll('.q-btn')
    const offerBtn = actions.find(action => action.text().includes('Create offer'));
    const needBtn = actions.find(action => action.text().includes('Create need'));
    expect(offerBtn).toBeDefined();
    expect(needBtn).toBeDefined();
  })
});
