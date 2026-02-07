import type { VueWrapper } from "@vue/test-utils";
import { shallowMount } from "@vue/test-utils";
import SimpleMap from "../SimpleMap.vue";

describe("SimpleMap", () => {
  let wrapper: VueWrapper;

  // Mount the component before each test.
  beforeEach(() => {
    const position = [41.5922793, 1.8342942] as [number, number];
    wrapper = shallowMount(SimpleMap, {
      props: {
        center: position,
        marker: position,
      },
    });
  });

  it("Html generated", async () => {
    await wrapper.vm.$nextTick();
    expect(wrapper.html()).toContain("anonymous-stub");
  });
});
