import type { VueWrapper } from "@vue/test-utils";
import { seeds } from "src/server";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import { QBtn, QDialog } from "quasar";
import PasswordField from "src/components/PasswordField.vue";
import ChangePasswordBtn from "src/pages/members/ChangePasswordBtn.vue";
import { config } from "src/utils/config";

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

  it("reactively updates the profile after posting the Social user", async () => {
    await wrapper.vm.$router.push("/profile");
    await waitFor(() => wrapper.text().includes("Edit profile"), true, "Profile form should load");
    await wrapper.vm.$store.dispatch("users/create", {
      resource: {
        type: "users",
        attributes: { email: "updated@example.com" }
      }
    });

    await waitFor(
      () => wrapper.get<HTMLInputElement>("input[name='email']").element.value,
      "updated@example.com",
      "Profile email should react to the updated Social user"
    );
  });

  it("posts a confirmed email to the Social user", async () => {
    const response = await fetch(`${config.AUTH_URL}/action-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "emailChange",
        userId: wrapper.vm.$store.getters.myUser.id,
        email: "confirmed@example.com"
      })
    });
    const { token } = await response.json();

    await wrapper.vm.$router.push({ path: "/confirm-email", query: { token } });
    await waitFor(
      () => wrapper.text().includes("Your email has been confirmed"),
      true,
      "Email confirmation should succeed"
    );
    expect(wrapper.vm.$store.getters.myUser.attributes.email).toBe("confirmed@example.com");
  });
});
