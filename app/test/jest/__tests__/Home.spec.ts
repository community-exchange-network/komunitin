import { VueWrapper, flushPromises } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
import {
  QInnerLoading,
  QToolbarTitle,
  QInfiniteScroll,
  QMenu,
} from "quasar";
import OfferCard from "../../../src/components/OfferCard.vue";
import PageHeader from "../../../src/layouts/PageHeader.vue";
import { seeds } from "src/server";
import NeedCard from "src/components/NeedCard.vue";
import ProfileBtnMenu from 'src/components/ProfileBtnMenu.vue';
import MemberHeader from 'src/components/MemberHeader.vue';

describe("Home", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("redirects to home after login", async () => {
    await wrapper.vm.$wait();
    // Navigate to login page, to trigger redirect to home (when logged in)
    // (Redirect after 'manual' login is already tested in Login.spec.ts)
    await wrapper.vm.$router.push("/login");
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$route.path).toBe("/home");
    expect(wrapper.findComponent(QToolbarTitle).text()).toBe("Home");
  });

  it("loads offers and needs", async () => {
    await wrapper.vm.$wait();
    await wrapper.vm.$router.push("/home");
    await wrapper.vm.$nextTick();

    // Wait for initial load
    await wrapper.vm.$wait();

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
    await wrapper.vm.$wait();
    expect(wrapper.findAllComponents(".q-card").length).toBeGreaterThan(21);
  });

  it("searches offers and needs", async () => {
    wrapper.getComponent(PageHeader).vm.$emit("search", "dolor");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAllComponents(OfferCard).length).toBe(0);
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    
    await wrapper.vm.$wait();

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

  it('displays Profile button and menu', async () => {
    const profileButton = wrapper.findComponent(ProfileBtnMenu);
    expect(profileButton.isVisible()).toBe(true);
    await profileButton.trigger('click');

    await wrapper.vm.$nextTick();

    const profileMenu = wrapper.getComponent(QMenu)
    expect(profileMenu.isVisible()).toBe(true);
    expect(profileMenu.getComponent(MemberHeader).text()).toContain('Emiliano Lemke');
  })
});
