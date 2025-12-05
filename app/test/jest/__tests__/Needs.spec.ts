 
/**
 * @jest-environment jsdom
 */
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
    // Wait for login redirect
    await wrapper.vm.$wait();
    await wrapper.vm.$router.push("/groups/GRP0/needs");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    // Load.
    await wrapper.vm.$wait();
    expect(wrapper.findAllComponents(NeedCard).length).toBe(4);
    // Infinite loading stops working immediately since we
    // already fetched all data.
    // Category
    expect(wrapper.findAllComponents(NeedCard)[1].text()).toContain("build");

    wrapper.getComponent(PageHeader).vm.$emit("search","modi");
    await wrapper.vm.$wait();
    // found 2 results!
    expect(wrapper.findAllComponents(NeedCard).length).toBe(2);
  });

  it ("Renders single need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/Et-quae-po");
    await wrapper.vm.$wait();
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
    await waitFor(() => wrapper.text().includes("Preview"))

    const select = wrapper.getComponent(SelectCategory).getComponent(QSelect)
    await select.trigger("click");
    await waitFor(() => select.findAllComponents(QItem).length > 0)

    const menu = select.findAllComponents(QItem);
    await menu[1].trigger("click");
    waitFor(() => select.text().includes("Games"))

    await wrapper.get("[name='description']").setValue("I really need this test to pass.")

    await wrapper.get("[type='submit']").trigger("click");
    await waitFor(() => wrapper.text().includes("I really need this test to pass."))
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/needs/I-really-n/preview");
    expect(wrapper.text()).toContain("Updated today");
    expect(wrapper.text()).toContain("Games");
    await wrapper.get(".q-btn--fab").trigger("click");
    
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/members/EmilianoLemke57");
    expect(wrapper.vm.$route.hash).toBe("#needs");
    await waitFor(() => wrapper.text().includes("I really need this test to pass."));
  });

  it ("Updates a need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/Dolorum-b/edit");
    await wrapper.vm.$wait();
    await wrapper.get("[name='description']").setValue("This is an updated description.")
    await wrapper.get("[type='submit']").trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/needs/Dolorum-b");
    const text = wrapper.text();
    expect(text).toContain("This is an updated description.");
  })

  it ("Deletes a need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/Dolorum-b");
    await wrapper.vm.$wait();
    await wrapper.getComponent(DeleteNeedBtn).trigger("click");
    await wrapper.vm.$wait();
    const buttons = wrapper.getComponent(QDialog).findAllComponents(QBtn)
    await buttons[1].trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/needs");
  })
});