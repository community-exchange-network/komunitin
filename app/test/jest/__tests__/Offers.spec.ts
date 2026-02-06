 
import { VueWrapper, flushPromises } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
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
    // Wait for login redirect
    await wrapper.vm.$wait();
    await wrapper.vm.$router.push("/groups/GRP0/offers");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    // Initial load.
    await wrapper.vm.$wait();
    expect(wrapper.findAllComponents(OfferCard).length).toBe(ApiSerializer.DEFAULT_PAGE_SIZE);
    // Instead of trying to simulate the scroll event, which is very coupled
    // with the tech layer, just call the trigger() function in QInfiniteScroll.
    (wrapper.findComponent(QInfiniteScroll).vm as QInfiniteScroll).trigger();
    await wrapper.vm.$wait();
    expect(wrapper.findAllComponents(OfferCard).length).toBe(30);
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
    await wrapper.vm.$wait();
    // found 2 results!
    expect(wrapper.findAllComponents(OfferCard).length).toBe(2);
  })

  it ("renders single offer", async() => {
    await wrapper.vm.$router.push("/groups/GRP0/offers/Tuna5");
    await wrapper.vm.$wait();
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
    await wrapper.vm.$wait();

    const select = wrapper.getComponent(SelectCategory).getComponent(QSelect)
    await select.trigger("click");
    await wrapper.vm.$wait();
    const menu = select.findAllComponents(QItem);
    menu[1].trigger("click");
    await flushPromises();

    await wrapper.get("[name='title']").setValue("The Offer")
    await wrapper.get("[name='description']").setValue("This offer is a mirage.")
    await wrapper.get("[name='price']").setValue("10")


    await wrapper.get("[type='submit']").trigger("click");
    await wrapper.vm.$wait();
    
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/offers/The-Offer/preview");
    await wrapper.vm.$wait();
    const text = wrapper.text();
    expect(text).toContain("This offer is a mirage.");
    expect(text).toContain("Updated today");
    expect(text).toContain("Games");
    await wrapper.get(".q-btn--fab").trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/members/EmilianoLemke57");
    expect(wrapper.vm.$route.hash).toBe("#offers");
    await wrapper.vm.$router.push("/groups/GRP0/offers/The-Offer")
    expect(wrapper.text()).toContain("The Offer");
    expect(wrapper.text()).toContain("$10.00");

  })

});