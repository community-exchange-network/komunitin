/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @jest-environment jsdom
 */
import { flushPromises, VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
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
    await wrapper.vm.$router.push("/login");
    // Wait for login redirect
    await flushPromises();
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/needs");
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
    expect(text).toContain("Baby");
    expect(text).toContain("Et quae");
    expect(text).toContain("GRP00009");
    expect(text).toContain("Updated yesterday");
    expect(text).toContain("Expires");
    expect(text).toContain("Share");
    expect(text).toContain("Contact");
  });

  it ("Creates a need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/new")
    await wrapper.vm.$wait();
    await wrapper.get("[name='description']").setValue("I really need this unit test to pass.")
    const select = wrapper.getComponent(SelectCategory).getComponent(QSelect)
    await select.trigger("click");
    await wrapper.vm.$wait();
    
    const menu = select.findAllComponents(QItem);
    await menu[1].trigger("click");
    await flushPromises();

    await wrapper.get("[type='submit']").trigger("click");
    await wrapper.vm.$wait();
    
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/needs/I-really-n/preview");
    const text = wrapper.text();
    expect(text).toContain("I really need this unit test to pass.");
    expect(text).toContain("Updated today");
    expect(text).toContain("Computers");
    await wrapper.get(".q-btn--fab").trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/members/EmilianoLemke57");
    expect(wrapper.vm.$route.hash).toBe("#needs");
    await wrapper.vm.$wait();
    const text2 = wrapper.text();
    expect(text2).toContain("I really need this unit test to pass.");
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
    const text = wrapper.text();
  })
});