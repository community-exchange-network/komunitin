 
import { flushPromises, VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import { QItem, QSelect, QDialog, QBtn, QInnerLoading } from "quasar";
import { seeds } from "src/server";
import SelectCategory from "src/components/SelectCategory.vue";
import DeleteNeedBtn from "src/components/DeleteNeedBtn.vue";

import NeedCard from "src/components/NeedCard.vue";
import PageHeader from "src/layouts/PageHeader.vue";

// See also Offers.spec.ts
describe("Needs", () => {
  let wrapper: VueWrapper;

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
    // Infinite loading stops working immediately since we
    // already fetched all data.
    // Category
    expect(wrapper.findAllComponents(NeedCard)[1].text()).toContain("build");

    wrapper.getComponent(PageHeader).vm.$emit("search","modi");
    await waitFor(() => wrapper.findAllComponents(NeedCard).length, 2, "Should find 2 needs matching 'modi'");
  });

  it ("Renders single need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/Et-quae-po");
    await waitFor(() => wrapper.text().includes("GRP00009"), true, "Need page should load member code");
    const text = wrapper.text();
    expect(text).toContain("Brigitte");
    expect(text).toContain("Shoes");
    expect(text).toContain("Et quae");
    expect(text).toContain("GRP00009");
    expect(text).toContain("Updated yesterday");
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
    await waitFor(() => (select.props("options") as any[])?.length > 0, true, "Categories should load");
    await select.trigger("click");
    await waitFor(() => select.findAllComponents(QItem).length > 0, true, "Category dropdown should open");

    const menu = select.findAllComponents(QItem);
    await menu[1].trigger("click");
    await waitFor(() => select.text().includes("Games"), true, "Games category should be selected")

    await wrapper.get("[name='description']").setValue("I really need this test to pass.")

    await wrapper.get("[type='submit']").trigger("click");
    await waitFor(() => wrapper.text().includes("I really need this test to pass."), true, "Need preview should show")
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/needs/I-really-n/preview");
    expect(wrapper.text()).toContain("Updated today");
    expect(wrapper.text()).toContain("Games");
    await wrapper.get(".q-btn--fab").trigger("click");
    
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/members/EmilianoLemke57");
    expect(wrapper.vm.$route.hash).toBe("#needs");
    await waitFor(() => wrapper.text().includes("I really need this test to pass."), true, "Need should appear in member page");
  });

  it ("Updates a need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/Dolorum-b/edit");
    await waitFor(() => wrapper.find("[name='description']").exists(), true, "Edit form should load");
    await wrapper.get("[name='description']").setValue("This is an updated description.")
    await wrapper.get("[type='submit']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/needs/Dolorum-b");
    await waitFor(() => wrapper.text().includes("This is an updated description."), true, "Updated description should show");
  })

  it ("Deletes a need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/Dolorum-b");
    await waitFor(() => wrapper.findComponent(DeleteNeedBtn).exists(), true, "Delete button should exist");
    await wrapper.getComponent(DeleteNeedBtn).trigger("click");
    await waitFor(() => wrapper.findComponent(QDialog).exists(), true, "Confirmation dialog should open");
    const buttons = wrapper.getComponent(QDialog).findAllComponents(QBtn)
    await buttons[1].trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/needs");
  })
});