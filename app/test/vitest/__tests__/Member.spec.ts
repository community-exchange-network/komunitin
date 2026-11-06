import type { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, requireText, requireTextExcerpt, waitFor } from "../utils";
import { QBtn, QMenu } from "quasar";
import NavButton from '@/components/NavButton.vue'
import PageHeader from '@/layouts/PageHeader.vue'
import FloatingBtn from '@/components/FloatingBtn.vue'
import NeedCard from "../../../src/components/NeedCard.vue";
import OfferCard from "../../../src/components/OfferCard.vue";
import MemberList from "../../../src/pages/members/MemberList.vue";
import MemberHeader from "../../../src/components/MemberHeader.vue";
import server, { seeds } from "@/server";
import TransactionItem from "../../../src/components/TransactionItem.vue";
import ProfileBtnMenu from '@/components/ProfileBtnMenu.vue';
import MenuItem from '@/components/MenuItem.vue';
import ContactButton from "@/components/ContactButton.vue";
import ShareButton from "@/components/ShareButton.vue";

describe("Member", () => {
  let wrapper: VueWrapper;
  const navigation = (label: string) => wrapper.findAllComponents(NavButton).find(button => button.text().includes(label))

  beforeAll(async () => {
    seeds();
    const member = server.schema.db.members[1]
    server.schema.db.accounts.update(member.accountId, { creditLimit: 0, maximumBalance: undefined })
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("Navigation to my account", async () => {
    const myMember = wrapper.vm.$store.getters.myMember;
    const myOffers = server.schema.db.posts.where({ memberId: myMember.id, type: 'offers' })
    const myNeed = server.schema.db.posts.findBy({ memberId: myMember.id, type: 'needs' })
    server.schema.db.posts.update(myOffers[0].id, { status: "hidden" })
    server.schema.db.posts.update(myOffers[1].id, { expires: "2000-01-01T00:00:00.000Z" })
    server.schema.db.posts.update(myNeed.id, { status: "hidden", expires: "2000-01-01T00:00:00.000Z" })

    // Open profile menu
    await wrapper.findComponent(ProfileBtnMenu).trigger('click');
    // Click members link
    const memberButton = wrapper
      .getComponent(QMenu)
      .findAllComponents(MenuItem)
      .find((item) => item.text().includes("Your profile"));
    await memberButton.trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, "/groups/GRP0/members/EmilianoLemke57");
    // Wait for content.
    await waitFor(() => navigation('Offers')?.text().includes('1'), true, "Member post counts should refresh");
    await waitFor(() => wrapper.text().includes('$734.69'), true);
    const text = wrapper.text();
    expect(text).toContain("GRP0000");
    expect(text).toContain('Credit Limit');
    expect(text).toContain('Maximum Balance');
    expect(wrapper.findAll('dd').map(value => value.text())).toEqual(['$100', '$500']);
    expect(wrapper.getComponent(PageHeader).text()).toContain('Member');
    expect(wrapper.get('h1').text()).toBe(myMember.attributes.name);
    expect(navigation('Wants').text()).toContain('0');
    expect(navigation('Transfers').attributes('href')).toBe('/groups/GRP0/members/EmilianoLemke57/transfers');

    // Bio
    const description = requireTextExcerpt(myMember.attributes.description, "Member description");
    expect(text).toContain(description);
    expect(myMember.attributes.contacts).not.toHaveLength(0);
    myMember.attributes.contacts.forEach((contact: { value: string }) => {
      expect(text).toContain(requireText(contact.value, "Member contact"));
    });
    expect(text).toContain(requireText(myMember.attributes.location.name, "Member location"));
    
    // Needs
    await navigation('Wants').trigger('click');
    await waitFor(() => wrapper.vm.$route.path, '/groups/GRP0/members/EmilianoLemke57/needs');
    expect(wrapper.getComponent(PageHeader).text()).toContain('Your wants');
    await waitFor(() => wrapper.findAllComponents(NeedCard).length, 1, "Should show 1 need");
    expect(wrapper.getComponent(FloatingBtn).text()).toContain('Create want');
    expect(wrapper.getComponent(FloatingBtn).getComponent(QBtn).attributes('href')).toBe('/groups/GRP0/needs/new');
    const unavailableNeed = wrapper.getComponent(NeedCard)
    expect(unavailableNeed.text()).toContain("Hidden")
    expect(unavailableNeed.text()).toContain("Expired")
    expect(unavailableNeed.findComponent(ContactButton).exists()).toBe(false)
    expect(unavailableNeed.findComponent(ShareButton).exists()).toBe(false)
    
    // Offers
    await navigation('Offers').trigger('click');
    await waitFor(() => wrapper.vm.$route.path, '/groups/GRP0/members/EmilianoLemke57/offers');
    expect(wrapper.getComponent(PageHeader).text()).toContain('Your offers');
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 3, "Should show 3 offers");
    expect(wrapper.getComponent(FloatingBtn).text()).toContain('Create offer');
    expect(wrapper.getComponent(FloatingBtn).getComponent(QBtn).attributes('href')).toBe('/groups/GRP0/offers/new');
    const hiddenOffer = wrapper.findAllComponents(OfferCard)
      .find(card => card.text().includes(myOffers[0].title))
    const expiredOffer = wrapper.findAllComponents(OfferCard)
      .find(card => card.text().includes(myOffers[1].title))
    expect(hiddenOffer?.text()).toContain("Hidden")
    expect(expiredOffer?.text()).toContain('Expired')
  });

  it("Navigation from Members List", async () => {
    await wrapper.get("#menu-members").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/members");
    await waitFor(
      () => wrapper.getComponent(MemberList).findAllComponents(MemberHeader).length >= 2,
      true,
      "Members list should load"
    );
    const member = wrapper.getComponent(MemberList).findAllComponents(MemberHeader)[1];
    const selected = member.props("member");
    const selectedDraft = server.schema.db.posts.findBy({ memberId: selected.id, type: 'offers' })
    server.schema.db.posts.update(selectedDraft.id, { status: "draft" })
    const selectedName = requireText(selected.attributes.name, "Selected member name");
    await member.trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, `/groups/GRP0/members/${selected.attributes.code}`);
    await waitFor(() => navigation('Offers')?.text().includes('2'), true, "Member post counts should refresh");
    await waitFor(() => wrapper.text().includes('$208.42'), true);
    const text = wrapper.text();
    expect(text).toContain(selectedName);
    expect(text).toContain("GRP00001");
    expect(wrapper.findAll('dd').map(value => value.text())).toEqual(['$0']);
    expect(text).not.toContain('Maximum Balance');
    const selectedDescription = requireTextExcerpt(
      selected.attributes.description,
      "Selected member description"
    );
    expect(text).toContain(selectedDescription);
    expect(selected.attributes.contacts).not.toHaveLength(0);
    selected.attributes.contacts.forEach((contact: { value: string }) => {
      expect(text).toContain(requireText(contact.value, "Selected member contact"));
    });

    // Needs (empty)
    expect(navigation('Wants').text()).toContain('0');
    
    await navigation('Wants').trigger('click');
    await waitFor(() => wrapper.text().includes("nothing here"), true, "Needs tab should show empty state");
    expect(wrapper.getComponent(PageHeader).text()).toContain('Member wants');
    
    //Offers
    expect(navigation('Offers').text()).toContain('2');
    
    await navigation('Offers').trigger('click');
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 3, "Should show 3 offers");
    const offers = wrapper.findAllComponents(OfferCard);
    expect(wrapper.getComponent(PageHeader).text()).toContain('Member offers');
    const offer = offers[0];
    expect(offer.text()).toContain(selectedName);
    const draftOffer = offers.find(card => card.text().includes(selectedDraft.title))
    expect(draftOffer?.text()).toContain("Draft")
    await draftOffer?.trigger("click")
    await waitFor(
      () => wrapper.vm.$route.path,
      `/groups/GRP0/offers/${selectedDraft.code}/preview`
    )
    await wrapper.getComponent(FloatingBtn).getComponent(QBtn).trigger('click')
    await waitFor(() => wrapper.vm.$route.path, `/groups/GRP0/members/${selected.attributes.code}/offers`)
    await waitFor(() => wrapper.findAllComponents(OfferCard).length, 3)
    await waitFor(() => wrapper.text().includes('Draft'), false)

    // Transactions
    await navigation('Transfers').trigger('click');
    await waitFor(() => wrapper.vm.$route.path, `/groups/GRP0/members/${selected.attributes.code}/transfers`);
    await waitFor(
      () => wrapper.findAllComponents(TransactionItem).length,
      7,
      "Should show 7 transactions"
    );
    expect(wrapper.getComponent(PageHeader).text()).toContain('Member transfers');
    await wrapper.get(`a[href="/groups/GRP0/members/${selected.attributes.code}"]`).trigger('click');
    await waitFor(() => wrapper.vm.$route.path, `/groups/GRP0/members/${selected.attributes.code}`);
    expect(wrapper.get('h1').text()).toBe(selectedName);
  });

})
