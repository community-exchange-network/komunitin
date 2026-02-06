 
import { VueWrapper, flushPromises } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import { QInnerLoading, QInfiniteScroll, QSelect, QItem } from "quasar";
import OfferCard from "../../../src/components/OfferCard.vue";
import PageHeader from "../../../src/layouts/PageHeader.vue";
import ApiSerializer from "src/server/ApiSerializer";
import { seeds } from "src/server";
import SelectCategory from "src/components/SelectCategory.vue";


describe("Offers", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("Loads offers", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/offers");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/offers");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    // Initial load.
    await waitFor(
      () => wrapper.findAllComponents(OfferCard).length,
      ApiSerializer.DEFAULT_PAGE_SIZE,
      "Should load initial page of offers"
    );
    // Instead of trying to simulate the scroll event, which is very coupled
    // with the tech layer, just call the trigger() function in QInfiniteScroll.
    (wrapper.findComponent(QInfiniteScroll).vm as QInfiniteScroll).trigger();
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 30, "Should load 30 offers after scroll");
    // Category icon
    expect(wrapper.findAllComponents(OfferCard)[0].text()).toContain("accessibility_new");
  });

  it ("searches offers", async () => {
    // The user interaction is already tested in PageHeader unit test,
    // here just emit the search event.
    wrapper.getComponent(PageHeader).vm.$emit("search","pants");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAllComponents(OfferCard).length).toBe(0);
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    // found 2 results!
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 2, "Should find 2 offers matching 'pants'");
  })

  it ("renders single offer", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/offers/Tuna5");
    await waitFor(() => wrapper.text().includes("Tuna"), true, "Offer page should load");
    const text = wrapper.text();
    expect(text).toContain("Tuna");
    expect(text).toContain("Arnoldo");
    expect(text).toContain("GRP00001");
    expect(text).toContain("$0.88");
    // The date is generated with faker.date.recent() so it could be "today" or "yesterday"
    // depending on when the test runs (especially around midnight boundaries).
    expect(text).toMatch(/Updated (yesterday|today)/);
  })

  it ("creates an offer", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/offers/new")
    await waitFor(() => wrapper.text().includes("Preview"), true, "New offer form should load");

    const select = wrapper.getComponent(SelectCategory).getComponent(QSelect)
    await waitFor(() => (select.props("options") as any[])?.length > 0, true, "Categories should load");
    await select.trigger("click");
    await waitFor(() => select.findAllComponents(QItem).length > 0, true, "Category dropdown should open");
    const menu = select.findAllComponents(QItem);
    await menu[1].trigger("click");
    await flushPromises();

    await wrapper.get("[name='title']").setValue("The Offer")
    await wrapper.get("[name='description']").setValue("This offer is a mirage.")
    await wrapper.get("[name='price']").setValue("10")

    await wrapper.get("[type='submit']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/offers/The-Offer/preview");
    await waitFor(() => wrapper.text().includes("This offer is a mirage."), true, "Offer preview should show");
    const text = wrapper.text();
    expect(text).toContain("This offer is a mirage.");
    expect(text).toContain("Updated today");
    expect(text).toContain("Games");
    await wrapper.get(".q-btn--fab").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/members/EmilianoLemke57");
    expect(wrapper.vm.$route.hash).toBe("#offers");
    await wrapper.vm.$router.push("/groups/GRP0/offers/The-Offer")
    await waitFor(() => wrapper.text().includes("The Offer"), true, "Offer page should show");
    expect(wrapper.text()).toContain("$10.00");
  })

});