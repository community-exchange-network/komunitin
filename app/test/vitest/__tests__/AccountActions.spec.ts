import type { VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { config } from "src/utils/config";
import server, { seeds } from "src/server";
import { mountComponent, waitFor } from "../utils";

async function actionToken(purpose: string, userId = "action-user") {
  const response = await fetch(`${config.AUTH_URL}/action-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, userId, email: "action@example.com" })
  });
  return (await response.json()).token as string;
}

describe("Public account action links", () => {
  let wrapper: VueWrapper;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App);
  });

  afterAll(() => wrapper.unmount());

  it.each(["emailVerification", "emailChange"])("confirms a %s token without creating a session", async purpose => {
    const token = await actionToken(purpose);
    await wrapper.vm.$router.push({ path: "/confirm-email", query: { token } });
    expect(wrapper.text()).not.toContain("Your email has been confirmed")
    await wrapper.get("#confirm-email").trigger("click")
    await waitFor(() => wrapper.text().includes("Your email has been confirmed"), true, "Email confirmation should succeed");
    expect(wrapper.vm.$route.path).toBe("/login-mail")
    expect(wrapper.get<HTMLInputElement>("input[type='email']").element.value).toBe("action@example.com")
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
    if (purpose === "emailChange") {
      const reusedToken = await fetch(`${config.AUTH_URL}/email/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      expect(reusedToken.status).toBe(400);
    }
  });

  it("resets a password without treating the action token as credentials", async () => {
    const token = await actionToken("passwordReset");
    await wrapper.vm.$router.push({ path: "/set-password", query: { token } });
    await wrapper.get("input[type='password']").setValue("new-password");
    await wrapper.get("button[type='submit']").trigger("click");
    await waitFor(() => wrapper.vm.$route.path, "/login-mail");
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
  });

  it("does not use a generic token query parameter as a login session", async () => {
    const token = await actionToken("emailVerification");
    await wrapper.vm.$router.push({ path: "/groups", query: { token } });
    await waitFor(() => wrapper.vm.$route.path, "/groups");
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
  });

  it("reuses one unsubscribe token for one-click and application flows", async () => {
    const meResponse = await fetch(`${config.SOCIAL_URL}/users/me`, {
      headers: { Authorization: "Bearer test_user_access_token" }
    });
    const me = await meResponse.json();
    const user = server.schema.users.find(me.data.id);
    const otherMember = server.schema.members.all().models.find(
      member => !user.memberIds.includes(member.id),
    );
    server.create("memberUser", {
      user,
      member: otherMember,
      notifications: { myAccount: false, group: true },
      emails: { myAccount: false, group: "weekly" },
    });
    const token = await actionToken("unsubscribe", me.data.id);

    const oneClickResponse = await fetch(`${config.SOCIAL_URL}/users/unsubscribe?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click"
    });
    expect(oneClickResponse.status).toBe(204);
    const relations = server.schema.memberUsers.where({ userId: me.data.id }).models;
    expect(relations.length).toBeGreaterThan(1);
    expect(relations.every(relation => relation.emails.group === "never")).toBe(true);
    expect(relations.at(-1).emails.myAccount).toBe(false);
    expect(relations.at(-1).notifications).toEqual({ myAccount: false, group: true });

    await wrapper.vm.$router.push({ path: "/unsubscribe", query: { token } });
    await waitFor(() => wrapper.text().includes("You've been unsubscribed"), true, "Unsubscribe status should succeed");
    expect(wrapper.text()).toContain("any of your communities");
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
  });
});
