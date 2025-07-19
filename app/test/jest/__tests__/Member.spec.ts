import { flushPromises, VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
import { QTab } from "quasar";
import NeedCard from "../../../src/components/NeedCard.vue";
import OfferCard from "../../../src/components/OfferCard.vue";
import MemberList from "../../../src/pages/members/MemberList.vue";
import MemberHeader from "../../../src/components/MemberHeader.vue";
import TransactionItems from "../../../src/pages/transactions/TransactionItems.vue";
import { seeds } from "src/server";
import TransactionItem from "../../../src/components/TransactionItem.vue";

describe("Member", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("Navigation to my account", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs")
    // Wait for the login redirect.
    await flushPromises();
    // Click members link
    await wrapper.get("#my-member").trigger("click");
    await flushPromises();
    expect(wrapper.vm.$route.fullPath).toBe("/groups/GRP0/members/EmilianoLemke57");
    // Wait for content.
    await wrapper.vm.$wait();
    const text = wrapper.text();
    expect(text).toContain("GRP0000");
    expect(text).toContain("Public account");
    expect(text).toContain("$734.69");
    expect(text).toContain("Min $-100");
    expect(text).toContain("Max $500");
    // Tabs
    expect(text).toContain("Profile");
    expect(text).toContain("1 Need");
    expect(text).toContain("3 Offers");
    expect(wrapper.findAllComponents(QTab).length).toBe(3);
    // Bio
    expect(text).toContain("Est placeat ex ut voluptas enim ex");
    // Contact
    expect(text).toContain("210-860-5469");
    expect(text).toContain("Kaley_Cummerata");
    // Location
    expect(text).toContain("Borders");
    
    // Needs

    const needsTab = wrapper.findAllComponents(QTab)[1];
    needsTab.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$wait();
    expect(wrapper.findAllComponents(NeedCard).length).toBe(1);
    
    // Offers
    const offersTab = wrapper.findAllComponents(QTab)[2];
    await offersTab.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$wait();
    expect(wrapper.findAllComponents(OfferCard).length).toBe(3);
  });

  it("Navigation from Members List", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs")
    // Wait for the login redirect.
    await flushPromises();
    wrapper.get("#menu-members").trigger("click");
    await wrapper.vm.$nextTicks();
    await wrapper.vm.$wait();
    const member = wrapper.getComponent(MemberList).findAllComponents(MemberHeader)[1];
    member.trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.fullPath).toBe("/groups/GRP0/members/ArnoldoErdman69");
    const text = wrapper.text();
    expect(text).toContain("Arnoldo");
    expect(text).toContain("GRP00001");
    expect(text).toContain("$208.42");
    expect(text).toContain("Voluptates totam quaerat eius aut odio adipisci");
    expect(text).toContain("@yahoo.com");
    expect(text).toContain("No Needs");
    expect(text).toContain("3 Offers");

    const tabs = wrapper.findAllComponents(QTab);
    expect(tabs.length).toBe(4);

    // Needs (empty)
    tabs[1].trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$wait();
    expect(wrapper.text()).toContain("nothing here");

    //Offers
    tabs[2].trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$wait();
    const offers = wrapper.findAllComponents(OfferCard);
    expect(offers.length).toBe(3);
    const offer = offers[0];
    expect(offer.text()).toContain("Arnoldo");

    // Transactions
    tabs[3].trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$wait();
    const transactions = wrapper.getComponent(TransactionItems).findAllComponents(TransactionItem);
    expect(transactions.length).toBe(7);
  });

})