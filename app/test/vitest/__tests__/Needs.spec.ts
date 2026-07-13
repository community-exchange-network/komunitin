 
import type { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, requireText, requireTextExcerpt, waitFor } from "../utils";
import { QItem, QSelect, QDialog, QBtn, QInnerLoading } from "quasar";
import { seeds } from "src/server";
import SelectCategory from "src/components/SelectCategory.vue";
import DeleteNeedBtn from "src/components/DeleteNeedBtn.vue";

import NeedCard from "src/components/NeedCard.vue";
import PageHeader from "src/layouts/PageHeader.vue";
import type { Category, Member, Need } from "src/store/model";

type FullNeed = Need & { member: Member, category: Category };
type SelectOption = { label: string, value: string };

// See also Offers.spec.ts
describe("Needs", () => {
  let wrapper: VueWrapper;
  let need: FullNeed;
  let editableNeed: FullNeed;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("Loads needs and searches", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/needs");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    // Load.
    await waitFor(() => wrapper.findAllComponents(NeedCard).length, 4, "Should load 4 needs");
    const needs = wrapper.findAllComponents(NeedCard).map(card => card.props("need") as FullNeed);
    need = needs[0];
    editableNeed = needs.find(item => item.member.id === wrapper.vm.$store.getters.myMember.id);
    // Infinite loading stops working immediately since we
    // already fetched all data.
    // Category
    expect(wrapper.findAllComponents(NeedCard)[1].text()).toContain("build");

    const search = requireText(
      need.attributes.description.split(/\W+/).find(word => word.length > 4),
      "Need search term"
    );
    const expected = needs.filter(item => JSON.stringify(item.attributes).toLowerCase().includes(search.toLowerCase())).length;
    expect(expected).toBeGreaterThan(0);
    wrapper.getComponent(PageHeader).vm.$emit("search", search);
    await waitFor(() => wrapper.findAllComponents(NeedCard).length, expected, `Should find needs matching '${search}'`);
  });

  it ("Renders single need", async () => {
    await wrapper.vm.$router.push(`/groups/GRP0/needs/${need.attributes.code}`);
    const description = requireTextExcerpt(need.attributes.description, "Need description");
    await waitFor(() => wrapper.text().includes(description), true, "Need page should load");
    const text = wrapper.text();
    expect(text).toContain(requireText(need.member.attributes.name, "Need member name"));
    expect(text).toContain(requireText(need.category.attributes.name, "Need category name"));
    expect(text).toMatch(/Updated (yesterday|today)/);
    expect(text).toContain("Expires");
    expect(text).toContain("Share");
    expect(text).toContain("Contact");
  });

  it ("Creates a need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/new")
    await waitFor(() => wrapper.text().includes("Preview"), true, "New need form should load")

    const selectCategory = wrapper.getComponent(SelectCategory);
    const select = selectCategory.getComponent(QSelect);
    // Wait for categories to load (they're fetched asynchronously via store)
    await waitFor(() => (select.props("options") as unknown[])?.length > 0, true, "Categories should load");
    await select.trigger("click");
    await waitFor(() => select.findAllComponents(QItem).length > 0, true, "Category dropdown should open");

    const menu = select.findAllComponents(QItem);
    const selectedCategory = (select.props("options") as SelectOption[])[1];
    const selectedCategoryName = requireText(selectedCategory.label, "Selected category name");
    await menu[1].trigger("click");
    await waitFor(() => select.props("modelValue")?.value, selectedCategory.value, "Category should be selected")

    await wrapper.get("[name='description']").setValue("I really need this test to pass.")

    await wrapper.get("[type='submit']").trigger("click");
    await waitFor(() => wrapper.text().includes("I really need this test to pass."), true, "Need preview should show")
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/needs/I-really-n/preview");
    expect(wrapper.text()).toContain("Updated today");
    expect(wrapper.text()).toContain(selectedCategoryName);
    await wrapper.get(".q-btn--fab").trigger("click");
    
    await waitFor(() => wrapper.vm.$route.path, `/groups/GRP0/members/${wrapper.vm.$store.getters.myMember.attributes.code}`);
    expect(wrapper.vm.$route.hash).toBe("#needs");
    await waitFor(() => wrapper.text().includes("I really need this test to pass."), true, "Need should appear in member page");
  });

  it ("Updates a need", async () => {
    await wrapper.vm.$router.push(`/groups/GRP0/needs/${editableNeed.attributes.code}/edit`);
    await waitFor(() => wrapper.find("[name='description']").exists(), true, "Edit form should load");
    await wrapper.get("[name='description']").setValue("This is an updated description.")
    await wrapper.get("[type='submit']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, `/groups/GRP0/needs/${editableNeed.attributes.code}`);
    await waitFor(() => wrapper.text().includes("This is an updated description."), true, "Updated description should show");
  })

  it ("Deletes a need", async () => {
    await wrapper.vm.$router.push(`/groups/GRP0/needs/${editableNeed.attributes.code}`);
    await waitFor(() => wrapper.findComponent(DeleteNeedBtn).exists(), true, "Delete button should exist");
    await wrapper.getComponent(DeleteNeedBtn).trigger("click");
    await waitFor(() => wrapper.findComponent(QDialog).exists(), true, "Confirmation dialog should open");
    const buttons = wrapper.getComponent(QDialog).findAllComponents(QBtn)
    await buttons[1].trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/needs");
  })
});
