import { vi } from 'vitest';
import { VueWrapper, flushPromises } from "@vue/test-utils";
import { seeds } from "src/server";
import { mountComponent, waitFor } from "../utils";
import App from "../../../src/App.vue";
import GroupCard from "../../../src/components/GroupCard.vue";
import { QBtn, QDialog, QInput, QItem, QSelect } from "quasar";
import CountryChooser from "src/components/CountryChooser.vue";

// Mock quasar.scroll used in Signup.vue and SignupMember.vue to scroll to top on step change.
vi.mock("quasar", async () => {
  const actual = await vi.importActual<typeof import("quasar")>("quasar");
  return {
    ...actual,
    scroll: {
      getScrollTarget: vi.fn(() => ({ scrollTo: vi.fn() })),
    }
  }
})

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
    // Wait for initial page load.
    await waitFor(() => wrapper.find("#explore").exists(), true, "Front page should show explore button");
    // Click explore button (UI-based navigation).
    await wrapper.get("#explore").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups");
    await waitFor(() => wrapper.findAllComponents(GroupCard).length > 0, true, "Groups should load");
    await wrapper.getComponent(GroupCard).get("a[href='/groups/GRP0/signup']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/signup");
    await waitFor(() => wrapper.text().includes("Membership terms"), true, "Signup page should show terms");
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
    await waitFor(() => wrapper.text().includes("Verify your email"), true, "Verification email page should show");
  })

  it('Creates member', async () => {
    await wrapper.vm.$router.push("/groups/GRP0/signup-member?token=empty_user")
    await waitFor(() => wrapper.find("[name='name']").exists(), true, "Signup member form should load");
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
    // Wait for country list to be loaded asynchronously (onMounted)
    await waitFor(() => (select.props("options") as any[])?.length > 0, true, "Country options should load");
    await select.trigger("click");
    await waitFor(() => select.findAllComponents(QItem).length > 0, true, "Country dropdown should open");
    const andorra = select.findAllComponents(QItem).find(i => i.text().includes("Andorra"));
    if (!andorra) throw new Error("Andorra option not found in dropdown");
    await andorra.trigger("click");
    await flushPromises();
    expect(select.get("input").element.value).toBe("Andorra");

    // Add contact
    const addContactBtn = wrapper.findAll("button").find(b => b.text() === "Add contact");
    expect(addContactBtn).toBeDefined();
    await addContactBtn?.trigger("click");
    await waitFor(() => wrapper.findComponent(QDialog).exists(), true, "Contact dialog should open");
    const dialog = wrapper.getComponent(QDialog);
    const type = dialog.getComponent(QSelect);
    await type.trigger("click");
    await waitFor(() => type.findAllComponents(QItem).length > 0, true, "Contact type dropdown should open");
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
    await waitFor(() => wrapper.text().includes("What do you offer?"), true, "Offer creation form should show");

    // Now go with the offer.
    await wrapper.get("[name='title']").setValue("Test Offer");
    await wrapper.get("[name='description']").setValue("This is a test offer.");
    await wrapper.get("[name='price']").setValue("10");

    const cat = wrapper.getComponent(QSelect)
    // Wait for categories to load (they're fetched asynchronously via store)
    await waitFor(() => (cat.props("options") as any[])?.length > 0, true, "Category options should load");
    await cat.trigger("click");
    await waitFor(() => cat.findAllComponents(QItem).length > 2, true, "Category dropdown should open")
    await cat.findAllComponents(QItem)[1].trigger("click");
    
    await wrapper.get("button[type='submit']").trigger("click");

    await waitFor(() => wrapper.text().includes("Signup complete"), true, "Signup should complete");
  }, 100000)
  
})