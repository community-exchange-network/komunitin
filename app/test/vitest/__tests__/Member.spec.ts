import type { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, requireText, requireTextExcerpt, waitFor } from "../utils";
import { QMenu, QTab } from "quasar";
import NeedCard from "../../../src/components/NeedCard.vue";
import OfferCard from "../../../src/components/OfferCard.vue";
import MemberList from "../../../src/pages/members/MemberList.vue";
import MemberHeader from "../../../src/components/MemberHeader.vue";
import TransactionItems from "../../../src/pages/transactions/TransactionItems.vue";
import server, { seeds } from "src/server";
import TransactionItem from "../../../src/components/TransactionItem.vue";
import ProfileBtnMenu from 'src/components/ProfileBtnMenu.vue';
import MenuItem from 'src/components/MenuItem.vue';
import ContactButton from "src/components/ContactButton.vue";
import ShareButton from "src/components/ShareButton.vue";

type MockPost = {
  type: "offers" | "needs"
  update: (attributes: { status?: string, expires?: string }) => void
}

type MockSchema = {
  posts: { where: (attributes: { memberId: string }) => { models: MockPost[] } }
}

const schema = server.schema as unknown as MockSchema

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
    const myMember = wrapper.vm.$store.getters.myMember;
    const myPosts = schema.posts.where({ memberId: myMember.id }).models
    const myOffers = myPosts.filter(post => post.type === "offers")
    const myNeeds = myPosts.filter(post => post.type === "needs")
    myOffers[0].update({ status: "hidden" })
    myOffers[1].update({ expires: "2000-01-01T00:00:00.000Z" })
    myNeeds[0].update({ status: "hidden", expires: "2000-01-01T00:00:00.000Z" })

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
    await waitFor(() => wrapper.text().includes("No Wants"), true, "Member post counts should refresh");
    const text = wrapper.text();
    expect(text).toContain("GRP0000");
    expect(text).toContain("$734.69");
    expect(text).toContain("Min $-100");
    expect(text).toContain("Max $500");
    // Tabs
    expect(text).toContain("Profile");
    expect(text).toContain("No Wants");
    expect(text).toContain("2 Offers");
    expect(wrapper.findAllComponents(QTab).length).toBe(3);
    // Bio
    const description = requireTextExcerpt(myMember.attributes.description, "Member description");
    expect(text).toContain(description);
    expect(myMember.attributes.contacts).not.toHaveLength(0);
    myMember.attributes.contacts.forEach((contact: { value: string }) => {
      expect(text).toContain(requireText(contact.value, "Member contact"));
    });
    expect(text).toContain(requireText(myMember.attributes.location.name, "Member location"));
    
    // Needs
    const needsTab = wrapper.findAllComponents(QTab)[1];
    await needsTab.trigger("click");
    await waitFor(() => wrapper.findAllComponents(NeedCard).length, 1, "Should show 1 need");
    const unavailableNeed = wrapper.getComponent(NeedCard)
    expect(unavailableNeed.text()).toContain("Hidden")
    expect(unavailableNeed.text()).toContain("Expired")
    expect(unavailableNeed.classes()).toContain("muted")
    expect(unavailableNeed.findComponent(ContactButton).exists()).toBe(false)
    expect(unavailableNeed.findComponent(ShareButton).exists()).toBe(false)
    
    // Offers
    const offersTab = wrapper.findAllComponents(QTab)[2];
    await offersTab.trigger("click");
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 3, "Should show 3 offers");
    const hiddenOffer = wrapper.findAllComponents(OfferCard)
      .find(card => card.props("offer").attributes.status === "hidden")
    const expiredOffer = wrapper.findAllComponents(OfferCard)
      .find(card => card.text().includes("Expired"))
    expect(hiddenOffer?.text()).toContain("Hidden")
    expect(hiddenOffer?.classes()).toContain("muted")
    expect(expiredOffer?.classes()).toContain("muted")
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
    const selected = member.props("member");
    const selectedPosts = schema.posts.where({ memberId: selected.id }).models
    selectedPosts.find(post => post.type === "offers")?.update({ status: "draft" })
    const selectedName = requireText(selected.attributes.name, "Selected member name");
    await member.trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, `/groups/GRP0/members/${selected.attributes.code}`);
    await waitFor(() => wrapper.text().includes("2 Offers"), true, "Member post counts should refresh");
    const text = wrapper.text();
    expect(text).toContain(selectedName);
    expect(text).toContain("GRP00001");
    expect(text).toContain("$208.42");
    const selectedDescription = requireTextExcerpt(
      selected.attributes.description,
      "Selected member description"
    );
    expect(text).toContain(selectedDescription);
    expect(selected.attributes.contacts).not.toHaveLength(0);
    selected.attributes.contacts.forEach((contact: { value: string }) => {
      expect(text).toContain(requireText(contact.value, "Selected member contact"));
    });
    expect(text).toContain("No Wants");
    expect(text).toContain("2 Offers");

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
    expect(offer.text()).toContain(selectedName);
    const draftOffer = offers.find(card => card.props("offer").attributes.status === "draft")
    expect(draftOffer?.text()).toContain("Draft")
    await draftOffer?.trigger("click")
    await waitFor(
      () => wrapper.vm.$route.path,
      `/groups/GRP0/offers/${draftOffer?.props("offer").attributes.code}/preview`
    )
    await wrapper.get(".q-btn--fab").trigger("click")
    await waitFor(() => wrapper.vm.$route.path, `/groups/GRP0/members/${selected.attributes.code}`)
    expect(wrapper.vm.$route.hash).toBe("#offers")

    // Transactions
    await wrapper.findAllComponents(QTab)[3].trigger("click");
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
