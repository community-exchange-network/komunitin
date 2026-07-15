import { vi } from 'vitest';
import { flushPromises } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import type * as Quasar from "quasar";
import { seeds } from "src/server";
import { mountComponent, waitFor } from "../utils";
import App from "../../../src/App.vue";
import GroupCard from "../../../src/components/GroupCard.vue";
import { QBtn, QDialog, QInput, QItem, QSelect } from "quasar";
import CountryChooser from "src/components/CountryChooser.vue";
import LocationPicker from "src/components/LocationPicker.vue";
import EditGroupForm from "src/pages/admin/EditGroupForm.vue";
import { config } from "src/utils/config";
import { Auth, type SignupContext } from "src/plugins/Auth";
import type { Group } from "src/store/model";

// Mock quasar.scroll used in Signup.vue and SignupMember.vue to scroll to top on step change.
vi.mock("quasar", async () => {
  const actual = await vi.importActual<typeof Quasar>("quasar");
  return {
    ...actual,
    scroll: {
      getScrollTarget: vi.fn(() => ({ scrollTo: vi.fn() })),
    }
  }
})

describe("Signup", () => {
  let wrapper: VueWrapper;

  const confirmAndLogin = async (
    email: string,
    password: string,
    signup: SignupContext,
    destination: string
  ) => {
    // The verification link may open in a different browser, where none of the
    // local state from registration exists.
    await new Auth().logout()
    const resumedRegistration = await fetch(`${config.AUTH_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, signup })
    })
    expect(resumedRegistration.status).toBe(200)

    const rejectedRegistration = await fetch(`${config.AUTH_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password", signup })
    })
    expect(rejectedRegistration.status).toBe(403)

    const prematureLogin = await fetch(`${config.AUTH_URL}/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        username: email,
        password
      })
    })
    expect(prematureLogin.status).toBe(400)
    expect(await prematureLogin.json()).toMatchObject({ error: "invalid_grant" })

    const response = await fetch(`${config.AUTH_URL}/action-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "emailVerification", userId: email, email, signup })
    });
    const { token } = await response.json();
    await wrapper.vm.$router.push({ path: "/confirm-email", query: { token } });
    await waitFor(() => wrapper.text().includes("Your email has been confirmed"), true, "Email should be confirmed");
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);

    // Reopening a consumed verification link must recover the same flow.
    await wrapper.vm.$router.push("/groups")
    await wrapper.vm.$router.push({ path: "/confirm-email", query: { token } })
    await waitFor(() => wrapper.text().includes("Your email has been confirmed"), true, "Used token should resume confirmation")
    expect(wrapper.get<HTMLInputElement>("input[type='email']").element.value).toBe(email)
    await wrapper.get("input[type='password']").setValue(password);
    await wrapper.get("button[type='submit']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, destination);
  };
  
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
    await wrapper.get("button[type='submit']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Set your credentials");
    await wrapper.get("[name='name']").setValue("Empty User");
    await wrapper.get("[name='email']").setValue("empty@example.com");
    await wrapper.get("[name='password']").setValue("password");
    await wrapper.get("button[type='submit']").trigger("click");
    await flushPromises();
    await waitFor(() => wrapper.text().includes("Verify your email"), true, "Verification waiting page should show");
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
    await confirmAndLogin("empty@example.com", "password", {
      type: "member",
      name: "Empty User",
      language: "en-us",
      groupCode: "GRP0"
    }, "/groups/GRP0/signup-member");
    expect(wrapper.find("[name='password']").exists()).toBe(false);
    expect(wrapper.vm.$store.getters.myUser.settings.attributes.language).toBe("en-us");
  })

  it('Creates member', async () => {
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
    await waitFor(() => (select.props("options") as unknown[])?.length > 0, true, "Country options should load");
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
    await waitFor(() => (cat.props("options") as unknown[])?.length > 0, true, "Category options should load");
    await cat.trigger("click");
    await waitFor(() => cat.findAllComponents(QItem).length > 2, true, "Category dropdown should open")
    await cat.findAllComponents(QItem)[1].trigger("click");
    
    await wrapper.get("button[type='submit']").trigger("click");

    await waitFor(() => wrapper.text().includes("Signup complete"), true, "Signup should complete");
  }, 100000)

  it("registers an administrator and requests a first group", async () => {
    await wrapper.vm.$store.dispatch("logout");
    await wrapper.vm.$router.push("/signup-group");
    await waitFor(() => wrapper.find("[name='name']").exists(), true, "Group administrator signup should load");
    await wrapper.get("[name='name']").setValue("Test Administrator");
    await wrapper.get("[name='email']").setValue("group-admin@example.com");
    await wrapper.get("[name='password']").setValue("password");
    await wrapper.get("button[type='submit']").trigger("click");
    await waitFor(() => wrapper.text().includes("Verify your email"), true, "Verification waiting page should show");
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
    await confirmAndLogin("group-admin@example.com", "password", {
      type: "group",
      name: "Test Administrator",
      language: "en-us"
    }, "/groups/new");

    const setInput = async (label: string, value: string) => {
      const field = wrapper.findAllComponents(QInput).find(input => input.props("label") === label);
      expect(field).toBeDefined();
      const control = field?.find("input").exists() ? field.get("input") : field?.get("textarea");
      await control?.setValue(value);
    };

    await setInput("Community Name", "Test Community");
    await setInput("Community Code", "TEST");
    await setInput("Description", "A community created through the new social API.");
    await setInput("City / Municipality", "Testville");
    await setInput("Region / State", "Testland");
    await setInput("Currency Name", "test credit");
    await setInput("Currency Name (plural)", "test credits");
    await setInput("Currency Symbol", "TC");
    wrapper.getComponent(LocationPicker).vm.$emit("update:modelValue", [2, 41]);

    const country = wrapper.getComponent(CountryChooser).getComponent(QSelect);
    await waitFor(() => (country.props("options") as unknown[])?.length > 0, true, "Country options should load");
    await country.setValue("ES");

    await waitFor(
      () => (wrapper.getComponent(EditGroupForm).emitted("update:group")?.at(-1)?.[0] as Group | undefined)?.attributes.code,
      "TEST",
      "Debounced group fields should be ready"
    );
    const request = wrapper.findAllComponents(QBtn).find(button => button.text().includes("Request new community"));
    expect(request).toBeDefined();
    await request?.trigger("click");
    await waitFor(
      () => wrapper.text().includes("Your request for the new community Test Community has been sent"),
      true,
      "Pending group confirmation should show"
    );
    expect(wrapper.vm.$store.getters["groups/current"].attributes.status).toBe("pending");
    const createdGroup = wrapper.vm.$store.getters["groups/current"];
    expect(createdGroup.relationships.admins.links.related).toBe(`${config.SOCIAL_URL}/TEST/admins`);
    const adminsResponse = await fetch(createdGroup.relationships.admins.links.related, {
      headers: { Authorization: `Bearer ${wrapper.vm.$store.getters.accessToken}` }
    });
    const admins = await adminsResponse.json();
    expect(admins.data[0].id).toBe(wrapper.vm.$store.getters.myUser.id);
    expect(wrapper.vm.$store.getters["groups/current"].relationships.currency.data.id).toBeTruthy();
  });
  
})
