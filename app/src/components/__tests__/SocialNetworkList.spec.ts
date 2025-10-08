import { mount, VueWrapper } from "@vue/test-utils";
import { config } from '@vue/test-utils';
import { quasarPlugin } from "../../../test/jest/utils/quasar-plugin";

// Install quasar plugin.
config.global.plugins.unshift(quasarPlugin);

describe("SocialNetworkList", () => {
  const contacts = [
    { type: "phone", name: "+34 666 77 88 99" },
    { type: "email", name: "exhange@easterisland.com" },
    { type: "whatsapp", name: "+34 666 66 66 66" },
    { type: "telegram", name: "@example" },
    { type: "unkonwn", name: "unknown" }
  ].map(obj => ({
    attributes: {
      ...obj,
      created: new Date().toJSON(),
      updated: new Date().toJSON()
    }
  } as any));

  let contact: VueWrapper;
  let share: VueWrapper;

  async function checkClick(wrapper: VueWrapper, ref: string, url: string) {
    // Mock window.open function.
    // delete window.open;
    window.open = jest.fn();
    // Click
    wrapper.findComponent({ ref: ref }).trigger("click");
    // Wait for event to be handled.
    await wrapper.vm.$nextTick();
    expect(window.open).toHaveBeenCalledWith(url, "_blank");
  }

  // Montamos el componente con los props necesarios antes de cada test.
  beforeEach(async () => {
    jest.doMock("vue-i18n", () => ({
      useI18n: () => ({
        t: (key: string) => key,
      }),
    }));

    const { default: SocialNetworkList } = await import("../SocialNetworkList.vue");

    contact = mount(SocialNetworkList, {
      props: {
        contacts: contacts,
        type: "contact"
      }
    });

    share = mount(SocialNetworkList, {
      props: {
        type: "share",
        title: "Title",
        text: "Text",
        url: "https://example.com"
      },
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("Contact html generated", async () => {
    // Test rendering.
    expect(contact.text()).toContain("+34 666 77 88 99");
  });

  it("Contact click", async () => {
    return checkClick(
      contact,
      "phone",
      "tel:" + encodeURIComponent("+34 666 77 88 99")
    );
  });

  it("Share html generated", async () => {
    expect(share.text()).toContain("Twitter");
  });

  it("Share click", async () => {
    return checkClick(
      share,
      "twitter",
      "https://twitter.com/intent/tweet?url=" +
        encodeURIComponent("https://example.com") +
        "&text=Title"
    );
  });
});
