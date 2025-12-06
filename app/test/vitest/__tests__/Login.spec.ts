import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { flushPromises, VueWrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
import MenuDrawer from "../../../src/components/MenuDrawer.vue";
import { seeds } from "src/server";
import MemberHeader from "src/components/MemberHeader.vue";
import { QList } from "quasar";

describe("Front page and login", () => {
  let wrapper: VueWrapper;
  beforeAll(async () => {
    wrapper = await mountComponent(App);
    seeds();
  });
  afterAll(() => wrapper.unmount());

  it("has explore and login buttons", () => {
    const html = wrapper.html();
    expect(html).toContain("account_circle");
    expect(html).toContain("explore");
  });

  it("goes to login with mail and back to front page", async () => {
    expect(wrapper.vm.$route.path).toBe("/");
    expect(wrapper.find("#back").isVisible()).toBe(false);
    // Click login button.
    await wrapper.get("#login").trigger("click");
    // Vue needs an additional nextTick()'s to render the content
    // got through router.
    await flushPromises()
    expect(wrapper.vm.$route.path).toBe("/login-mail");
    // Click back
    expect(wrapper.get("#back").isVisible()).toBe(true);
    // Click back again
    expect(wrapper.get("#back").isVisible()).toBe(true);
    wrapper.get("#back").trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/");
  });

  it("login and logout", async () => {
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false);
    // Go to login with mail page.
    wrapper.vm.$router.push("/login-mail");
    await flushPromises()
    // Button is disabled since form is empty.
    expect(wrapper.get("button[type='submit']").attributes("disabled"))
      .toBeDefined();
    await wrapper.get("input[type='email']").setValue("example@example.com");
    await wrapper.get("input[type='password']").setValue("password");
    await wrapper.vm.$nextTick();
    // Button is enabled now.
    expect(
      wrapper.get("button[type='submit']").attributes("disabled")
    ).toBeUndefined();
    wrapper.get("button[type='submit']").trigger("click");
    await wrapper.vm.$wait()
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(true);
    expect(wrapper.vm.$route.path).toBe("/home");
    // Click the account switcher
    wrapper
      .get("#my-member")
      .get("button")
      .trigger("click");
    await wrapper.vm.$nextTick();
    // Click logout (be careful with teleports when finding the element)
    wrapper
      .getComponent(MenuDrawer)
      .getComponent(MemberHeader)
      .getComponent(QList)
      .get("#user-menu-logout")
      .trigger("click");
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/");
  });
  
});
