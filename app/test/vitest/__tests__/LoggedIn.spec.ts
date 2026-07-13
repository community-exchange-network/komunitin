import type { VueWrapper } from "@vue/test-utils";
import { seeds } from "src/server";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import { QBtn, QDialog } from "quasar";
import PasswordField from "src/components/PasswordField.vue";
import ChangePasswordBtn from "src/pages/members/ChangePasswordBtn.vue";

describe("logged in", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.unmount());

  it("redirects when logged in", async () => {
    const router = wrapper.vm.$router;
    await router.isReady();
    // Router guards are installed after router has its initial push in test environment. 
    // That's why we force a push so the guard is executed.
    await router.push("/login")
    await waitFor(() => wrapper.vm.$route.path, "/home");
    expect(wrapper.vm.$route.path).toBe("/home");
    
    const text = wrapper.text();
    // Page title
    expect(text).toContain("Home");
    // Group name
    expect(text).toContain("Group 0");
  })

  it("changes the current user's password through auth", async () => {
    await wrapper.vm.$router.push("/profile");
    await waitFor(() => wrapper.text().includes("Edit profile"), true, "Profile form should load");
    const passwordControl = wrapper.getComponent(ChangePasswordBtn);
    await passwordControl.findAllComponents(QBtn)[0].trigger("click");
    await waitFor(() => passwordControl.getComponent(QDialog).props("modelValue"), true, "Password dialog should open");

    const inputs = passwordControl.findAllComponents(PasswordField);
    await inputs[0].get("input").setValue("komunitin");
    await inputs[1].get("input").setValue("new-password");
    const submit = passwordControl.findAllComponents(QBtn)
      .find(button => button.props("type") === "submit" && button.text().includes("Change password"));
    expect(submit).toBeDefined();
    await submit?.trigger("click");
    await waitFor(() => passwordControl.getComponent(QDialog).props("modelValue"), false, "Password dialog should close");
  });

  it("shows the Auth session email in the profile", async () => {
    await wrapper.vm.$router.push("/profile");
    await waitFor(() => wrapper.text().includes("Edit profile"), true, "Profile form should load");
    const tokens = wrapper.vm.$store.state.me.tokens;
    wrapper.vm.$store.commit("tokens", { ...tokens, email: "updated@example.com" });

    await waitFor(
      () => wrapper.get<HTMLInputElement>("input[name='email']").element.value,
      "updated@example.com",
      "Primary email should come from Auth"
    );
    wrapper.vm.$store.commit("tokens", tokens);
  });
});
