
import SelectLang from "../SelectLang.vue";
import type { VueWrapper } from "@vue/test-utils";
import { mountComponent, waitFor } from "../../../test/vitest/utils";
import { i18n } from "src/boot/i18n";
import { normalizeLocale } from "src/i18n";
import { QItem } from "quasar";

describe("Locale", () => {
  let wrapper: VueWrapper;
  beforeAll(async () => {
    wrapper = await mountComponent(SelectLang);
  });
  afterAll(() => wrapper.unmount());

  describe("normalizeLocale", () => {
    it("maps exact locales correctly", () => {
      expect(normalizeLocale("en-us")).toBe("en-us");
      expect(normalizeLocale("en-gb")).toBe("en-gb");
      expect(normalizeLocale("ca")).toBe("ca");
      expect(normalizeLocale("es")).toBe("es");
      expect(normalizeLocale("fr")).toBe("fr");
      expect(normalizeLocale("it")).toBe("it");
    });

    it("handles case-insensitive matching", () => {
      expect(normalizeLocale("en-US")).toBe("en-us");
      expect(normalizeLocale("en-GB")).toBe("en-gb");
      expect(normalizeLocale("EN-US")).toBe("en-us");
    });

    it("maps non-US English sub-locales to en-gb", () => {
      expect(normalizeLocale("en-IE")).toBe("en-gb");
      expect(normalizeLocale("en-AU")).toBe("en-gb");
      expect(normalizeLocale("en-NZ")).toBe("en-gb");
      expect(normalizeLocale("en-ZA")).toBe("en-gb");
    });

    it("maps bare en to default en-us", () => {
      expect(normalizeLocale("en")).toBe("en-us");
    });

    it("maps unknown sub-locales with known base to the base locale", () => {
      expect(normalizeLocale("es-AR")).toBe("es");
      expect(normalizeLocale("fr-CA")).toBe("fr");
      expect(normalizeLocale("it-CH")).toBe("it");
    });

    it("maps unknown locales to default", () => {
      expect(normalizeLocale("de")).toBe("en-us");
      expect(normalizeLocale("zh-CN")).toBe("en-us");
    });
  });

  describe("en-US and en-GB date/time settings", () => {
    it("en-US uses Sunday as first day of week and 12h format", async () => {
      // Start with en-US
      expect(wrapper.vm.$i18n.locale).toBe("en-us");
      expect(wrapper.vm.$q.lang.isoName).toBe("en-US");
      // en-US: Sunday is first day of week, 12h format
      expect(wrapper.vm.$q.lang.date.firstDayOfWeek).toBe(0);
      expect(wrapper.vm.$q.lang.date.format24h).toBe(false);
    });

    it("en-GB uses Monday as first day of week and 24h format", async () => {
      // Switch to en-GB
      await wrapper.get("button").trigger("click");
      await waitFor(() => wrapper.findAllComponents(QItem).length > 0, true, "Language dropdown should open");
      const items = wrapper.findAllComponents(QItem);
      const enGB = items.find(item => item.text().includes("English (UK)"));
      if (!enGB) throw new Error("English (UK) option not found in dropdown");
      await enGB.trigger("click");

      await waitFor(() => i18n.global.locale.value === "en-gb", true, "Locale should change to en-gb");
      expect(wrapper.vm.$q.lang.isoName).toBe("en-GB");
      // en-GB: Monday is first day of week, 24h format
      expect(wrapper.vm.$q.lang.date.firstDayOfWeek).toBe(1);
      expect(wrapper.vm.$q.lang.date.format24h).toBe(true);
    });

    it("en-GB strings fall back to en-US", async () => {
      // en-GB should have the same strings as en-US
      expect(i18n.global.locale.value).toBe("en-gb");
      expect(i18n.global.t("home")).toBe("Home");
      expect(i18n.global.t("logIn")).toBe("Log in");
      expect(i18n.global.t("language")).toBe("Language");
    });
  });
});
