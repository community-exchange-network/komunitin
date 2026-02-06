
import SelectLang from "../SelectLang.vue";
import type { VueWrapper} from "@vue/test-utils";
import { mountComponent, waitFor } from "../../../test/jest/utils";
import { i18n } from "src/boot/i18n";
import { QItem } from "quasar";

/**
 * This test uses the global Vue variable in order to properly interact 
 * with boot functions and i18n plugin. It does not just tet the component 
 * but also the language logic.
 * **/
describe("SelectLang", () => {
  let wrapper: VueWrapper;
  beforeAll(async () => {
    wrapper = await mountComponent(SelectLang);
  });
  afterAll(() => wrapper.unmount());

  it("Check language change", async () => {
    expect(wrapper.text()).toContain("Language");
    // Check language on i18n plugin.
    expect(wrapper.vm.$i18n.locale).toBe("en-us");
    // Check language on quasar.
    expect(wrapper.vm.$q.lang.isoName).toBe("en-US");
    
    // Open the dropdown and click on Catalan.
    await wrapper.get("button").trigger("click");
    await waitFor(() => wrapper.findAllComponents(QItem).length > 0, true, "Language dropdown should open");
    const items = wrapper.findAllComponents(QItem);
    const catalan = items.find(item => item.text().includes("Català"));
    expect(catalan).toBeDefined();
    await catalan!.trigger("click");
    
    // Wait for async locale change
    await waitFor(() => i18n.global.locale.value === "ca", true, "Locale should change to Catalan");
    // Check language changed on quasar.
    expect(wrapper.vm.$q.lang.isoName).toBe("ca");
    // Check emit
    expect(wrapper.emitted('language-change')).toBeTruthy();
  });
});
