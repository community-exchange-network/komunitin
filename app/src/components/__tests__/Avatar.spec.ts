import { installQuasarPlugin } from '@quasar/quasar-app-extension-testing-unit-vitest';
import { mount } from "@vue/test-utils";
import { describe, expect, it } from 'vitest';
import Avatar from "../Avatar.vue";
import {QAvatar} from "quasar";

installQuasarPlugin({ components: { QAvatar } });

describe("SimpleMap", () => {  

  it("Renders image", async () => {
    const wrapper = mount(Avatar, {
      props: {
        imgSrc: "https://path_to_image.com",
        text: "anything"
      }
    });
    expect(wrapper.html()).toContain("<img src=\"https://path_to_image.com\"");
  });

  it("Renders initial", async () => {
    const wrapper = mount(Avatar, {
      propsData: {
        text: "anything"
      }
    });
    expect(wrapper.html()).not.toContain("<img");
    expect(wrapper.text()).toEqual("A");
    expect(wrapper.html()).toContain("background-color: rgb(204, 41, 90);");
  });

});