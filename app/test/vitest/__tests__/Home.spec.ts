import { type VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import {
  QInnerLoading,
  QToolbarTitle,
  QInfiniteScroll,
  QMenu,
  QChip,
  QBtn,
  QItem,
  QInput,
  QDate,
} from "quasar";
import OfferCard from "../../../src/components/OfferCard.vue";
import PageHeader from "../../../src/layouts/PageHeader.vue";
import { seeds } from "@/server";
import NeedCard from "@/components/NeedCard.vue";
import ProfileBtnMenu from '@/components/ProfileBtnMenu.vue';
import MenuItem from '@/components/MenuItem.vue';
import FeedFilter from '@/components/FeedFilter.vue';
import AdvancedFilters from '@/components/AdvancedFilters.vue';

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
    await waitFor(() => wrapper.findAllComponents(NeedCard).length > 0, true, "Should find matching needs");
  });
  
  it("filters by type", async () => {
    const feedFilter = wrapper.getComponent(FeedFilter);

    feedFilter.vm.$emit("update:type", "offers");
    await waitFor(() => wrapper.findAllComponents(NeedCard).length, 0, "Wants should be hidden");
    expect(wrapper.findAllComponents(OfferCard).length).toBeGreaterThan(0);

    feedFilter.vm.$emit("update:type", "needs");
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 0, "Offers should be hidden");
    expect(wrapper.findAllComponents(NeedCard).length).toBeGreaterThan(0);

    feedFilter.vm.$emit("update:type", "all");
    await waitFor(() => wrapper.findAllComponents(OfferCard).length > 0 && wrapper.findAllComponents(NeedCard).length > 0, true, "Offers and wants should both be shown again");
  });

  it("filters by category using the advanced filters panel", async () => {
    const offer = wrapper.findAllComponents(OfferCard)[0].props("offer");
    const categoryId = offer.category.id;
    const categoryName = offer.category.attributes.name;

    // Open the panel from the header button.
    const filterBtn = wrapper.getComponent(PageHeader).findAllComponents(QBtn)
      .find(b => b.props("icon") === "filter_list");
    await filterBtn?.trigger("click");

    const advancedFilters = wrapper.getComponent(AdvancedFilters);
    const categoryItem = advancedFilters.findAllComponents(QItem)
      .find(item => item.text().includes(categoryName));
    await categoryItem?.trigger("click");

    const applyBtn = advancedFilters.findAllComponents(QBtn).find(b => b.text() === "Apply filters");
    await applyBtn?.trigger("click");

    await waitFor(() => wrapper.findAllComponents(OfferCard).length > 0, true, "Should find offers matching the category");
    const cards = [...wrapper.findAllComponents(OfferCard), ...wrapper.findAllComponents(NeedCard)];
    cards.forEach((card) => {
      const resource = card.props("offer") ?? card.props("need");
      expect(resource.category.id).toBe(categoryId);
    });

    // Reopen, reset and apply to clear the filter again.
    await filterBtn?.trigger("click");
    const resetBtn = advancedFilters.findAllComponents(QBtn).find(b => b.text() === "Reset");
    await resetBtn?.trigger("click");
    const applyBtn2 = advancedFilters.findAllComponents(QBtn).find(b => b.text() === "Apply filters");
    await applyBtn2?.trigger("click");

    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 20, "Should show all offers again");
  });

  describe("date filter in the advanced filters panel", () => {
    const filterBtn = () => wrapper.getComponent(PageHeader).findAllComponents(QBtn)
      .find(b => b.props("icon") === "filter_list");
    const panelBtn = (label: string) => wrapper.getComponent(AdvancedFilters)
      .findAllComponents(QBtn).find(b => b.text() === label);

    const dateInput = () => wrapper.getComponent(AdvancedFilters).getComponent(QInput);

    // Opens the panel and the date picker from the calendar icon, and returns the picker.
    const openDatePicker = async () => {
      await filterBtn()?.trigger("click");
      await dateInput().findAll("i").find(i => i.text() === "event")?.trigger("click");
      await waitFor(() => wrapper.findComponent(QDate).exists(), true, "Date picker should open");
      return wrapper.getComponent(QDate);
    }

    const closeDatePickerAndApply = async () => {
      await wrapper.getComponent(QDate).findAllComponents(QBtn).find(b => b.text() === "Close")?.trigger("click");
      await waitFor(() => wrapper.findComponent(QDate).exists(), false, "Date picker should close");
      await panelBtn("Apply filters")?.trigger("click");
    }

    const resetFilters = async () => {
      await filterBtn()?.trigger("click");
      await panelBtn("Reset")?.trigger("click");
      await panelBtn("Apply filters")?.trigger("click");
      await waitFor(() => wrapper.findAllComponents(OfferCard).length, 20, "Should show all offers again");
    }

    it("filters by a range of two dates", async () => {
      const picker = await openDatePicker();
      picker.vm.$emit("update:modelValue", { from: "2099/01/01", to: "2099/12/31" });
      await closeDatePickerAndApply();

      // Every offer/want is created in the past, so a future range must exclude them all.
      await waitFor(
        () => wrapper.findAllComponents(OfferCard).length + wrapper.findAllComponents(NeedCard).length,
        0,
        "No offers or wants should match a future date range"
      );
      await resetFilters();
    });

    it("filters by a single day when only one date is picked", async () => {
      // The mock server compares against UTC midnight, so pick the day in UTC.
      const created = wrapper.findAllComponents(OfferCard)[0].props("offer").attributes.created as string;
      const day = created.slice(0, 10);
      const [year, month, date] = day.split("-").map(Number);
      const picker = await openDatePicker();
      picker.vm.$emit("rangeStart", { year, month, day: date });
      await closeDatePickerAndApply();

      await waitFor(() => {
        const count = wrapper.findAllComponents(OfferCard).length;
        return count > 0 && count < 20;
      }, true, "Results should narrow to a single day");
      const cards = [...wrapper.findAllComponents(OfferCard), ...wrapper.findAllComponents(NeedCard)];
      cards.forEach(card => {
        const resource = card.props("offer") ?? card.props("need");
        expect(resource.attributes.created.slice(0, 10)).toBe(day);
      });
      await resetFilters();
    });

    it("does not open the date picker when clicking the field", async () => {
      await filterBtn()?.trigger("click");
      await dateInput().trigger("click");
      await wrapper.vm.$nextTick();
      expect(wrapper.findComponent(QDate).exists()).toBe(false);
      await filterBtn()?.trigger("click");
    });

    it("filters by a typed date range", async () => {
      await filterBtn()?.trigger("click");
      await dateInput().get("input").setValue("12/31/2099 – 01/01/2099");
      await dateInput().get("input").trigger("keyup.enter");
      // Reversed dates are put in order.
      expect(dateInput().get("input").element.value).toBe("01/01/2099 – 12/31/2099");
      await panelBtn("Apply filters")?.trigger("click");

      await waitFor(
        () => wrapper.findAllComponents(OfferCard).length + wrapper.findAllComponents(NeedCard).length,
        0,
        "No offers or wants should match a future date range"
      );
      await resetFilters();
    });

    it("does not apply an invalid typed date", async () => {
      await filterBtn()?.trigger("click");
      await dateInput().get("input").setValue("not a date");
      await panelBtn("Apply filters")?.trigger("click");

      expect(dateInput().props("error")).toBe(true);
      expect(wrapper.getComponent(AdvancedFilters).props("modelValue")).toBe(true);
      await panelBtn("Reset")?.trigger("click");
      expect(dateInput().props("error")).toBe(false);
      await panelBtn("Apply filters")?.trigger("click");
      await waitFor(() => wrapper.findAllComponents(OfferCard).length, 20, "Should show all offers");
    });
  });

  it("changes sort order via the dropdown chip", async () => {
    const feedFilter = wrapper.getComponent(FeedFilter);
    const sortChip = feedFilter.findAllComponents(QChip).find(c => c.props("icon") === "sort");
    expect(sortChip?.text()).toContain("Date");

    await sortChip?.trigger("click");
    const distanceItem = feedFilter.findAllComponents(QItem).find(item => item.text().includes("Distance"));
    await distanceItem?.trigger("click");
    expect(sortChip?.text()).toContain("Distance");
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 20, "Offers should still load when sorting by distance");

    // Restore the default.
    await sortChip?.trigger("click");
    const dateItem = feedFilter.findAllComponents(QItem).find(item => item.text().includes("Date"));
    await dateItem?.trigger("click");
    expect(sortChip?.text()).toContain("Date");
  });

  it('displays FAB', async () => {
    const fab = wrapper.get('.q-fab');
    expect(fab.text().includes('Create')).toBe(true);
    await fab.trigger('click');
    const actions = fab.findAll('.q-btn')
    const offerBtn = actions.find(action => action.text().includes('Create offer'));
    const needBtn = actions.find(action => action.text().includes('Create want'));
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
    const myNeedsBtn = profileMenu.findAllComponents(MenuItem).find(item => item.text().includes('My wants'));
    const logOutBtn = profileMenu.findAllComponents(MenuItem).find(item => item.text().includes('Log out'));

    expect(myProfileBtn).toBeDefined();
    expect(myOffersBtn).toBeDefined();
    expect(myNeedsBtn).toBeDefined();
    expect(logOutBtn).toBeDefined();
  })
});
