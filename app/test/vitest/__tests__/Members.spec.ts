 
import type { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, requireText, waitFor } from "../utils";
import { QInnerLoading, QInfiniteScroll, QAvatar } from "quasar";
import MemberHeader from "../../../src/components/MemberHeader.vue";
import PageHeader from "../../../src/layouts/PageHeader.vue";
import MemberList from "../../../src/pages/members/MemberList.vue";
import { seeds } from "src/server";

// See also Offers.spec.ts
describe("Members", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("Loads members, balances and searches", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/needs");
    // Click members link
    await wrapper.get("#menu-members").trigger("click");
    await waitFor(() => wrapper.vm.$route.fullPath, "/groups/GRP0/members");
    expect(wrapper.getComponent(QInnerLoading).isVisible()).toBe(true);
    // Wait for content loading.
    await waitFor(
      () => wrapper.getComponent(MemberList).findAllComponents(MemberHeader).length,
      20,
      "Should load 20 members"
    );
    (wrapper.getComponent(QInfiniteScroll).vm as QInfiniteScroll).trigger();
    await waitFor(
      () => wrapper.getComponent(MemberList).findAllComponents(MemberHeader).length,
      31,
      "Should load all 31 members after infinite scroll"
    );
    // Check GRP00002 result
    const members = wrapper.getComponent(MemberList).findAllComponents(MemberHeader);
    const second = members[2];
    const secondName = requireText(second.props("member").attributes.name, "Member name");
    expect(second.text()).toContain(secondName);
    expect(second.text()).toContain("GRP00002");
    expect(second.text()).toContain("$987.10");
    // Avatar image
    expect(second.html()).toContain("<img");

    // Default avatar
    const avatar = members[0].findComponent(QAvatar); 
    expect(avatar.text()).toEqual("E");

    // Check GRP00025 result
    const other = members[25];
    const otherName = requireText(other.props("member").attributes.name, "Member name");
    expect(other.text()).toContain(otherName);
    expect(other.text()).toContain("GRP00025");
    expect(other.text()).toContain("$-208.12");
    // Search
    const target = members[5].props("member");
    const targetName = requireText(target.attributes.name, "Search target name");
    const search = requireText(targetName.split(" ").at(-1), "Member search term");
    wrapper.getComponent(PageHeader).vm.$emit("search", search);
    await waitFor(
      () => wrapper.getComponent(MemberList).findAllComponents(MemberHeader).length,
      1,
      `Should find 1 member matching '${search}'`
    );
    const result = wrapper.getComponent(MemberList).getComponent(MemberHeader);
    expect(result.text()).toContain(targetName);
    expect(result.text()).toContain("GRP00005");
    expect(result.text()).toContain("$346.21");
  }, 20000);
});
