import { installQuasarPlugin } from '@quasar/quasar-app-extension-testing-unit-vitest';
import { describe, expect, it } from 'vitest';
import { shallowMount } from "@vue/test-utils";
import AccountLimits from "../AccountLimits.vue";
import {QSeparator} from 'quasar'
import { createI18n } from "vue-i18n";

// Install quasar (only with 1 component).
installQuasarPlugin({
  components: {
    QSeparator
  }
});

// Install i18n.
const i18n = createI18n({
  legacy: false
})

describe('AccountLimits.vue', () => {
  const mocks = {
    $t: (key: string, value: {amount: number}) => `${key} ${value.amount}`,
    $n: (n: number) => n + '',
  };
  const currency = {
    attributes: {
      decimals: 2,
      scale: 2,
      symbol: "%"
    }
  }

  it("renders credit limit", () => {
    const account = {
      attributes: {
        creditLimit: 5000,
        maximumBalance: -1
      },
      currency
    };
    const wrapper = shallowMount(AccountLimits, {
      props: {
        account
      },
      global: {
        mocks,
        plugins: [i18n]
      }
    });
    expect(wrapper.text()).toBe("minAmount %-50");
  });

  it("renders debit limit", () => {
    const account = {
      attributes: {
        maximumBalance: 5000,
        creditLimit: -1
      },
      currency
    };
    const wrapper = shallowMount(AccountLimits, {
      props: {
        account
      },
      global: {
        mocks,
        plugins: [i18n]
      },
    });
    expect(wrapper.text()).toBe("maxAmount %50");
  });

  it("renders both limits", () => {
    const account = {
      attributes: {
        maximumBalance: 5000,
        creditLimit: 6000
      },
      currency
    };
    const wrapper = shallowMount(AccountLimits, {
      propsData: {
        account
      },
      global: {
        mocks,
        plugins: [i18n]
      }
    });
    expect(wrapper.text()).toContain("minAmount %-60");
    expect(wrapper.text()).toContain("maxAmount %50");
  });

})
