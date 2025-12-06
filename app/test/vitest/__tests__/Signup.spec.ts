import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { VueWrapper, flushPromises } from "@vue/test-utils";
import { seeds } from "src/server";
import { mountComponent, waitFor } from "../utils";
import App from "../../../src/App.vue";
import GroupCard from "../../../src/components/GroupCard.vue";
import { QBtn, QDialog, QInput, QItem, QSelect } from "quasar";
import CountryChooser from "src/components/CountryChooser.vue";

import { vi } from 'vitest';

// mock quasar.scroll.
vi.mock("quasar", async () => {
  const actual = await vi.importActual("quasar");
  return {
    ...actual,
    scroll: {
      getScrollTarget: vi.fn(() => ({
        scrollTo: vi.fn()
      })),
    }
  }
})

// With vitest, the default import of "i18n-iso-countries" does not behave well and
// thats why we need to mock it. An alternative is to add "i18n-iso-countries" to
// list of ES modules in vitest.config.
vi.mock("i18n-iso-countries", () => ({
  registerLocale: vi.fn(),
  getNames: vi.fn(() => ({
    'IT': 'Italy',
    'ES': 'Spain',
    'GR': 'Greece',
    'AD': 'Andorra'
  })),
}))



describe("Signup", () => {
  let wrapper: VueWrapper;
  
  beforeAll(async () => {  
    seeds();
    wrapper = await mountComponent(App);
  });

  afterAll(() => {
    wrapper.unmount();
  });

  it("Creates user", async () => {
    await wrapper.vm.$router.push("/");
    wrapper.get("#explore").trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups");
    await wrapper.getComponent(GroupCard).get("a[href='/groups/GRP0/signup']").trigger("click");
    await wrapper.vm.$wait();
    
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/signup");
    expect(wrapper.text()).toContain("Membership terms");
    expect(wrapper.text()).toContain("Group 0");
    expect(wrapper.text()).toContain("Voluptatibus");
    await wrapper.get("button[type='submit']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Set your credentials");
    await wrapper.get("[name='name']").setValue("Empty User");
    await wrapper.get("[name='email']").setValue("empty@example.com");
    await wrapper.get("[name='password']").setValue("password");
    await wrapper.get("button[type='submit']").trigger("click");
    await flushPromises();
    await wrapper.vm.$wait();
    expect(wrapper.text()).toContain("Verify your email");
  })

  it('Creates member', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/signup-member?token=empty_user")
    await wrapper.vm.$wait();
    // Check that the inactive banner does not show yet.
    expect(wrapper.text()).not.toContain("Your account is inactive.");
    expect(wrapper.get<HTMLInputElement>("[name='name']").element.value).toBe("Empty User");
    await wrapper.get("[name='description']").setValue("I am a test user.");
    expect(wrapper.get<HTMLInputElement>("[name='email']").element.value).toBe("empty@example.com");
    await wrapper.get<HTMLInputElement>("[name='address']").setValue("1234 Test St.");
    await wrapper.get<HTMLInputElement>("[name='postalCode']").setValue("12345");
    await wrapper.get<HTMLInputElement>("[name='city']").setValue("Testville");
    await wrapper.get<HTMLInputElement>("[name='region']").setValue("Testland");

    // Select Andorra
    const select = wrapper.getComponent(CountryChooser).getComponent(QSelect)
    await select.trigger("click");
    await wrapper.vm.$wait();
    const menu = select.findAllComponents(QItem);
    menu[3].trigger("click");
    await flushPromises();
    expect(select.get("input").element.value).toBe("Andorra");

    // Add contact
    const addContactBtn = wrapper.findAll("button").find(b => b.text() === "Add contact");
    expect(addContactBtn).toBeDefined();
    await addContactBtn?.trigger("click");
    await flushPromises();
    const dialog = wrapper.getComponent(QDialog);
    const type = dialog.getComponent(QSelect);
    await type.trigger("click");
    await wrapper.vm.$wait();
    const typeMenu = type.findAllComponents(QItem);
    await typeMenu[0].trigger("click");
    const input = dialog.getComponent(QInput);
    expect(input.text()).toBe("Phone");
    await input.get("input").setValue("123-456-7890");
    const button = dialog.findAllComponents(QBtn).find(b => b.text() === "Add contact")
    expect(button).toBeDefined();
    await button?.trigger("click");
    await flushPromises();
    // Save profile
    await wrapper.get("button[type='submit']").trigger("click");
    await wrapper.vm.$wait();

    // Now go with the offer.
    expect(wrapper.text()).toContain("What do you offer?");
    await wrapper.get("[name='title']").setValue("Test Offer");
    await wrapper.get("[name='description']").setValue("This is a test offer.");
    await wrapper.get("[name='price']").setValue("10");

    const cat = wrapper.getComponent(QSelect)
    await cat.trigger("click");
    await waitFor(() => cat.findAllComponents(QItem).length > 2)
    await cat.findAllComponents(QItem)[1].trigger("click");
    
    await wrapper.get("button[type='submit']").trigger("click");

    await wrapper.vm.$wait();
    expect(wrapper.text()).toContain("Signup complete");
  }, 100000)
  
})