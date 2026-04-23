
import SelectLang from "../SelectLang.vue";

import { mount, type VueWrapper } from "@vue/test-utils";
import { mountComponent, waitFor } from "../../../test/vitest/utils";
import { i18n, setLocale } from "src/boot/i18n";
import { QItem } from "quasar";
import DatePicker from "../DateField.vue";
import { quasarPlugin } from "../../../test/vitest/utils/quasar-plugin";

/**
 * This test uses the global Vue variable in order to properly interact 
 * with boot functions and i18n plugin. It does not just tet the component 
 * but also the language logic.
 * **/
describe("SelectLang", () => {
  let wrapper: VueWrapper;

  beforeEach(async () => {
    await setLocale("en-us");
    wrapper = await mountComponent(SelectLang);
  });

  afterEach(() => wrapper.unmount());

  const chooseLanguage = async (code: string, label: string) => {
    // Open the dropdown and click on the target language option.
    await wrapper.get("button").trigger("click");
    await waitFor(() => wrapper.findAllComponents(QItem).length > 0, true, "Language dropdown should open");
    const items = wrapper.findAllComponents(QItem);
    const item = items.find(item => item.text().includes(label));
    if (!item) throw new Error(`${label} option not found in dropdown`);
    await item.trigger("click");
    // Wait for async locale change
    await waitFor(() => i18n.global.locale.value === code, true, "Locale should change to " + code + " (was " + i18n.global.locale.value + ")");
    await waitFor(() => wrapper.vm.$q.lang.isoName.toLowerCase() === code, true, "Quasar language should change to " + code + " (was " + wrapper.vm.$q.lang.isoName + ")");
    // Check emit
    expect(wrapper.emitted('language-change')).toBeTruthy();
  }

  const mountDatePicker = (date: Date) => {
    return mount(DatePicker, {
      props: {
        modelValue: date,
        label: "Date",
      },
      global: {
        plugins: [i18n, quasarPlugin],
      },
    });
  };

  it("Check language change", async () => {
    expect(wrapper.text()).toContain("Language");
    // Check language on i18n plugin.
    expect(wrapper.vm.$i18n.locale).toBe("en-us");
    // Check language on quasar.
    expect(wrapper.vm.$q.lang.isoName).toBe("en-US");
    
    await chooseLanguage("ca", "Català");
  });

  it("Date format should be different across languages", async () => {
    await setLocale("en-us");
    await waitFor(() => i18n.global.locale.value, "en-us", "Locale should be en-us");
    const date = new Date(2024, 0, 31, 12, 0, 0);
    const enUsDatePicker = mountDatePicker(date);
    const output = enUsDatePicker.get("input").element.value;
    // In English (US) locale, the date format should be "MM/DD/YYYY".
    expect(output).toBe("01/31/2024");
    enUsDatePicker.unmount();

    await setLocale("en-gb");
    await waitFor(() => i18n.global.locale.value, "en-gb", "Locale should be en-gb");
    const enGbDatePicker = mountDatePicker(date);
    // In English (UK) locale, the date format should be "DD/MM/YYYY".
    expect(enGbDatePicker.get("input").element.value).toBe("31/01/2024");
    enGbDatePicker.unmount();
  });

  it("Should load fallback locale messages", async () => {
    await setLocale("en-gb");
    await waitFor(() => i18n.global.locale.value, "en-gb", "Locale should be en-gb");
    // en-gb does not have its own messages, but should fallback to en-us.
    expect(wrapper.vm.$t('signUp')).toBe("Sign up");
  });
});
