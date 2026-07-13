 
import type { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, requireText, waitFor } from "../utils";
import { QInnerLoading, QInfiniteScroll, QSelect, QItem } from "quasar";
import OfferCard from "../../../src/components/OfferCard.vue";
import PageHeader from "../../../src/layouts/PageHeader.vue";
import ApiSerializer from "src/server/ApiSerializer";
import { seeds } from "src/server";
import SelectCategory from "src/components/SelectCategory.vue";
import type { Category, Member, Offer } from "src/store/model";

type FullOffer = Offer & { member: Member, category: Category };
type SelectOption = { label: string, value: string };


describe("Offers", () => {
  let wrapper: VueWrapper;
  let offer: FullOffer;

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
    offer = wrapper.findAllComponents(OfferCard)[0].props("offer") as FullOffer;
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
    await wrapper.vm.$router.push(`/groups/GRP0/offers/${offer.attributes.code}`);
    const title = requireText(offer.attributes.title, "Offer title");
    await waitFor(() => wrapper.text().includes(title), true, "Offer page should load");
    const text = wrapper.text();
    expect(text).toContain(title);
    expect(text).toContain(requireText(offer.member.attributes.name, "Offer member name"));
    expect(text).toContain(requireText(offer.category.attributes.name, "Offer category name"));
    // The date is generated with faker.date.recent() so it could be "today" or "yesterday"
    // depending on when the test runs (especially around midnight boundaries).
    expect(text).toMatch(/Updated (yesterday|today)/);
  })

  it ("creates an offer", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/offers/new")
    await waitFor(() => wrapper.text().includes("Preview"), true, "New offer form should load");

    const select = wrapper.getComponent(SelectCategory).getComponent(QSelect)
    await waitFor(() => (select.props("options") as unknown[])?.length > 0, true, "Categories should load");
    await select.trigger("click");
    await waitFor(() => select.findAllComponents(QItem).length > 0, true, "Category dropdown should open");
    const menu = select.findAllComponents(QItem);
    const selectedCategory = (select.props("options") as SelectOption[])[1];
    const selectedCategoryName = requireText(selectedCategory.label, "Selected category name");
    await menu[1].trigger("click");
    await waitFor(() => select.props("modelValue")?.value, selectedCategory.value, "Category should be selected");

    await wrapper.get("[name='title']").setValue("The Offer")
    await wrapper.get("[name='description']").setValue("This offer is a mirage.")
    await wrapper.get("[name='price']").setValue("10")

    await wrapper.get("[type='submit']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/offers/The-Offer/preview");
    await waitFor(() => wrapper.text().includes("This offer is a mirage."), true, "Offer preview should show");
    const text = wrapper.text();
    expect(text).toContain("This offer is a mirage.");
    expect(text).toContain("Updated today");
    expect(text).toContain(selectedCategoryName);
    await wrapper.get(".q-btn--fab").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, `/groups/GRP0/members/${wrapper.vm.$store.getters.myMember.attributes.code}`);
    expect(wrapper.vm.$route.hash).toBe("#offers");
    await wrapper.vm.$router.push("/groups/GRP0/offers/The-Offer")
    await waitFor(() => wrapper.text().includes("The Offer"), true, "Offer page should show");
    expect(wrapper.text()).toContain("$10.00");
  })

});
