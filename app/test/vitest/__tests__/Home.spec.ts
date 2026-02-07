import { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
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
import MenuItem from 'src/components/MenuItem.vue';

describe("Home", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("redirects to home after login", async () => {
    // Navigate to login page, to trigger redirect to home (when logged in)
    // (Redirect after 'manual' login is already tested in Login.spec.ts)
    await wrapper.vm.$router.push("/login");
    await waitFor(() => wrapper.vm.$route.path, "/home");
    expect(wrapper.findComponent(QToolbarTitle).text()).toBe("Home");
  });

  it("loads offers and needs", async () => {
    await wrapper.vm.$router.push("/home");
    await waitFor(() => wrapper.vm.$route.path, "/home");

    // Wait for data to load
    await waitFor(
      () => (wrapper.vm.$store.getters["offers/currentList"]?.length ?? 0) > 0,
      true,
      "Offers should be loaded"
    );
    await waitFor(
      () => (wrapper.vm.$store.getters["needs/currentList"]?.length ?? 0) > 0,
      true,
      "Needs should be loaded"
    );

    // Check that both (and only) offer and need cards are rendered
    const cards = wrapper.findAllComponents(".q-card");
    cards.forEach((card) => {
      const isOfferCard = card.findComponent(OfferCard)?.exists() || false;
      const isNeedCard = card.findComponent(NeedCard)?.exists() || false;

      expect(isOfferCard || isNeedCard).toBe(true);
    });

    // trigger infinite-scroll
    (wrapper.findComponent(QInfiniteScroll).vm as QInfiniteScroll).trigger();
    await waitFor(() => wrapper.findAllComponents(".q-card").length > 21, true, "Infinite scroll should load more cards");
  });

  it("searches offers and needs", async () => {
    wrapper.getComponent(PageHeader).vm.$emit("search", "dolor");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAllComponents(OfferCard).length).toBe(0);
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    
    // Wait for search results to load
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 20, "Should find 20 offers matching 'dolor'");
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

    const profileMenu = wrapper.getComponent(QMenu);
    expect(profileMenu.isVisible()).toBe(true);
    // Workaround for targeting teleport-rendered element that is not a Component.
    // Returns a native DOM element
    const profileDetails = profileMenu.element.ownerDocument.querySelector('[data-testid="profile-details"]');
    expect(profileDetails.textContent).toContain('Emiliano Lemke');
    
    const myProfileBtn = profileMenu.findAllComponents(MenuItem).find(item => item.text().includes('My profile'));
    const myOffersBtn = profileMenu.findAllComponents(MenuItem).find(item => item.text().includes('My offers'));
    const myNeedsBtn = profileMenu.findAllComponents(MenuItem).find(item => item.text().includes('My needs'));
    const logOutBtn = profileMenu.findAllComponents(MenuItem).find(item => item.text().includes('Log out'));

    expect(myProfileBtn).toBeDefined();
    expect(myOffersBtn).toBeDefined();
    expect(myNeedsBtn).toBeDefined();
    expect(logOutBtn).toBeDefined();
  })
});
