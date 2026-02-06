import { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import { QMenu, QTab } from "quasar";
import NeedCard from "../../../src/components/NeedCard.vue";
import OfferCard from "../../../src/components/OfferCard.vue";
import MemberList from "../../../src/pages/members/MemberList.vue";
import MemberHeader from "../../../src/components/MemberHeader.vue";
import TransactionItems from "../../../src/pages/transactions/TransactionItems.vue";
import { seeds } from "src/server";
import TransactionItem from "../../../src/components/TransactionItem.vue";
import ProfileBtnMenu from 'src/components/ProfileBtnMenu.vue';
import MenuItem from 'src/components/MenuItem.vue';

describe("Member", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("Navigation to my account", async () => {
    await wrapper.vm.$router.push("/login");
    // Wait for the login redirect to Home.
    await waitFor(() => wrapper.vm.$route.path, "/home");
    // Open profile menu
    await wrapper.findComponent(ProfileBtnMenu).trigger('click');
    await wrapper.vm.$nextTick();
    // Click members link
    const memberButton = wrapper
      .getComponent(QMenu)
      .findAllComponents(MenuItem)
      .find((item) => item.text().includes("My profile"));
    await memberButton.trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, "/groups/GRP0/members/EmilianoLemke57");
    // Wait for content.
    await waitFor(() => wrapper.text().includes("GRP0000"), true, "Member page should load content");
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
    await needsTab.trigger("click");
    await waitFor(() => wrapper.findAllComponents(NeedCard).length, 1, "Should show 1 need");
    
    // Offers
    const offersTab = wrapper.findAllComponents(QTab)[2];
    await offersTab.trigger("click");
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 3, "Should show 3 offers");
  });

  it("Navigation from Members List", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs")
    // Wait for the page to load.
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/needs");
    await wrapper.get("#menu-members").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/members");
    await waitFor(
      () => wrapper.getComponent(MemberList).findAllComponents(MemberHeader).length >= 2,
      true,
      "Members list should load"
    );
    const member = wrapper.getComponent(MemberList).findAllComponents(MemberHeader)[1];
    await member.trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, "/groups/GRP0/members/ArnoldoErdman69");
    await waitFor(() => wrapper.text().includes("Arnoldo"), true, "Member page should load");
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
    await tabs[1].trigger("click");
    await waitFor(() => wrapper.text().includes("nothing here"), true, "Needs tab should show empty state");

    //Offers
    await tabs[2].trigger("click");
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 3, "Should show 3 offers");
    const offers = wrapper.findAllComponents(OfferCard);
    const offer = offers[0];
    expect(offer.text()).toContain("Arnoldo");

    // Transactions
    await tabs[3].trigger("click");
    await waitFor(
      () => {
        const ti = wrapper.findComponent(TransactionItems);
        return ti.exists() ? ti.findAllComponents(TransactionItem).length : 0;
      },
      7,
      "Should show 7 transactions"
    );
  });

})