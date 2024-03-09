/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { config, mount, VueWrapper } from "@vue/test-utils";
import { createStore, Store } from "vuex";

import {
  QBtn,
  QInput,
  QLayout,
  Quasar
} from "quasar";
import PageHeader from "../PageHeader.vue";
import { createI18n } from "vue-i18n";
import { defineComponent } from "vue";

// Install quasar.
config.global.plugins.unshift([Quasar, {}]);
// Install i18n.
const i18n = createI18n({
  legacy: false
})
config.global.plugins.unshift([i18n])

jest.mock("../../plugins/Notifications")
jest.mock("@firebase/messaging");
jest.mock('vue-router', () => ({
  useRoute: jest.fn(),
  useRouter: jest.fn(() => ({
    push: jest.fn()
  }))
}))

describe("PageHeader", () => {
  let wrapper: VueWrapper;
  let toogleDrawer: () => void;
  let store : Store<any>;

  beforeEach(() => {
    toogleDrawer = jest.fn();
    store = createStore({
      state: () => ({
        ui: {
          drawerPersistent: true,
          drawerState: true,
          drawerExists: true
        },
        stub: {
          myAccount: undefined,
        }
      }),
      getters: {
        drawerExists: state => state.ui.drawerExists,
        myAccount: state => state.stub.myAccount,
      },
      mutations: {
        drawerPersistent: (state, v) => (state.ui.drawerPersistent = v),
        drawerState: (state, v) => (state.ui.drawerState = v),
        drawerExists: (state, v) => (state.ui.drawerExists = v),
        myAccount: (state, v) => (state.stub.myAccount = v),
      },
      actions: { toogleDrawer }
    });

    const TestComponent = defineComponent({
      template: `
        <q-layout view="LHH LpR LfR">
          <PageHeader title="Test title" search balance />
        </q-layout>
      `
    });

    wrapper = mount(TestComponent, {
      global: {
        mocks: {
          $t: (key: string) => key,
          $n: (n: number) => n + '',
        },
        plugins: [store]
      },
      components: {
        PageHeader,
        QLayout
      },
      attachTo: document.body
    });

  });

  afterEach(() => wrapper?.unmount());

  function findSearchButton(wrapper: VueWrapper) {
    const button = wrapper
      .findAllComponents(QBtn)
      .filter(button => button.text().includes("search"));

    return (button.length > 0) ? button[0] : null;
  }

  it("has back icon", async () => {
    store.commit("drawerExists", false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find("#menu").exists()).toBe(false);
    expect(wrapper.find("#back").exists()).toBe(true);
  });

  it("has menu icon", async () => {
    store.commit("drawerExists", true);
    store.commit("drawerPersistent", false);
    store.commit("drawerState", false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find("#back").exists()).toBe(false);
    const menu = wrapper.find("#menu");
    expect(menu.exists()).toBe(true);
    menu.trigger("click");
    await wrapper.vm.$nextTick();
    expect(toogleDrawer).toBeCalled();
  });

  it("doesn't have icon", async () => {
    store.commit("drawerExists", true);
    store.commit("drawerPersistent", true);
    store.commit("drawerState", true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find("#back").exists()).toBe(false);
    expect(wrapper.find("#menu").exists()).toBe(false);
  });

  it("has search box", async () => {
    expect(wrapper.text()).toContain("Test title");
    expect(wrapper.findComponent(QInput).exists()).toBe(false);
    const search = findSearchButton(wrapper) as VueWrapper;
    expect(search.exists()).toBe(true);
    await search.trigger("click");
    await wrapper.vm.$nextTick();
    expect(findSearchButton(wrapper)).toBe(null);
    expect(wrapper.text()).not.toContain("Test title");
    const input = wrapper.find("input");
    expect(input.exists()).toBe(true);
    // Focus
    expect(input.element).toBe(document.activeElement);
    const pageHeader = wrapper.findComponent(PageHeader);
    input.setValue("a");
    await wrapper.vm.$nextTick();
    // Jest somehow seems to trick the debouncing behavior of QInput
    // henve expecting here directly the set value instead of undefined.
    expect(pageHeader.emitted("search-input")).toBeTruthy();
    expect(
      (pageHeader.emitted("search-input") as string[][])[0]
    ).toEqual(["a"]);
    // Search on enter.
    expect(pageHeader.emitted("search")).toBeUndefined();
    input.trigger("keyup.enter");
    await wrapper.vm.$nextTick();
    expect(pageHeader.emitted("search")).toBeTruthy();
    expect((pageHeader.emitted("search") as Array<Array<string>>)[0]).toEqual([
      "a"
    ]);
    // Clear
    wrapper
      .findAll("i")
      .filter(i => i.text().includes("clear"))[0]
      .trigger("click");
    await wrapper.vm.$nextTick();
    expect(
      (pageHeader.emitted("search-input") as string[][])[1]
    ).toEqual([""]);
  });
  it("shows the balance", async () => {
    const account = {
      attributes: {
        balance: 100
      },
      currency: {
        attributes: {
          scale: 2,
          decimals: 2,
          symbol: "$"
        },
      }
    }
    store.commit("myAccount", account);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("balance");
    expect(wrapper.text()).toContain("$1.00");
    const header = wrapper.get<HTMLDivElement>('#header');
    expect(header.element.style.height).toBe("170px");
    const pageHeader = wrapper.getComponent(PageHeader);
    // I could not emulate the scroll event and as a weaker substitute I
    // just irectly call the event handler hoping that the even conection
    // will just work.
    const scrollDetails = {
      position: {
        top: 0,
        left: 0
      },
      direction: "down",
      directionChanged: false,
      delta: {
        top: 0,
        left: 0
      },
      inflectionPoint: {
        top: 0,
        left: 0
      }
    }
    scrollDetails.position.top = 10;
    pageHeader.vm.scrollHandler(scrollDetails);
    await wrapper.vm.$nextTick();
    expect(header.element.style.height).toBe("160px");
    expect(wrapper.text()).toContain("$");
    scrollDetails.position.top = 101;
    pageHeader.vm.scrollHandler(scrollDetails);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("$");
    expect(header.element.style.height).toBe("69px");
    scrollDetails.position.top = 200;
    pageHeader.vm.scrollHandler(scrollDetails);
    await wrapper.vm.$nextTick();
    expect(header.element.style.height).toBe("64px");
    
  });
});
