import type { VueWrapper } from "@vue/test-utils";
import { mount, shallowMount } from "@vue/test-utils";
import { defineComponent, h, onMounted } from "vue";
import { vi } from "vitest";

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
    expect(wrapper.html()).toContain("l-map-stub");
  });

  it("fits current bounds when the map becomes ready", async () => {
    const position = [41.5922793, 1.8342942] as [number, number];
    const fitBounds = vi.fn();
    const LMapStub = defineComponent({
      emits: ["ready"],
      setup(_props, { emit, expose, slots }) {
        expose({ leafletObject: { fitBounds } });
        onMounted(() => emit("ready"));
        return () => h("div", slots.default?.());
      },
    });

    wrapper = mount(SimpleMap, {
      props: {
        center: position,
        marker: position,
        bounds: [
          [41, 1],
          [42, 2],
        ],
      },
      global: {
        stubs: {
          LMap: LMapStub,
          LTileLayer: true,
          LMarker: true,
        },
      },
    });

    await wrapper.vm.$nextTick();

    expect(fitBounds).toHaveBeenCalledOnce();
    expect(fitBounds.mock.calls[0][0].isValid()).toBe(true);
  });

  it("forwards bounds changes to LMap", async () => {
    const position = [41.5922793, 1.8342942] as [number, number];
    const fitBounds = vi.fn();
    const LMapStub = defineComponent({
      props: {
        bounds: {
          type: [Array, Object],
          default: undefined,
        },
      },
      emits: ["ready"],
      setup(_props, { emit, expose, slots }) {
        expose({ leafletObject: { fitBounds } });
        onMounted(() => emit("ready"));
        return () => h("div", slots.default?.());
      },
    });

    wrapper = mount(SimpleMap, {
      props: {
        center: position,
        marker: position,
      },
      global: {
        stubs: {
          LMap: LMapStub,
          LTileLayer: true,
          LMarker: true,
        },
      },
    });

    const bounds = [
      [41, 1],
      [42, 2],
    ];
    await wrapper.setProps({
      bounds,
    });

    expect(wrapper.findComponent(LMapStub).props("bounds")).toEqual(bounds);
    expect(fitBounds).not.toHaveBeenCalled();
  });
});
