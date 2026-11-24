<template>
  <div class="q-gutter-y-lg">
    <div>
      <h1 class="text-title-medium q-ma-none">
        {{ $t('externalPayments') }}
      </h1>
      <div class="text-on-surface-medium">
        {{ $t('externalPaymentsText') }}
      </div>
    </div>
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('settings') }}
    </div>
    <toggle-item
      v-model="enableExternalPayments"
      @update:model-value="updateSettings({ enableExternalPayments })"
      :label="$t('enableExternalPayments')"
      :hint="$t('enableExternalPaymentsHint')"
    />
    <toggle-item
      v-model="enableExternalPaymentRequests"
      @update:model-value="updateSettings({ enableExternalPaymentRequests })"
      :label="$t('enableExternalPaymentRequests')"
      :hint="$t('enableExternalPaymentRequestsHint')"
    />
    <toggle-item
      v-model="enableCreditCommonsPayments"
      @update:model-value="updateSettings({ enableCreditCommonsPayments })"
      :label="$t('enableCreditCommonsPayments')"
      :hint="$t('enableCreditCommonsPaymentsHint')"
    />
    <toggle-item
      v-model="allowAnonymousMemberList"
      @update:model-value="saveGroupSettings({ allowAnonymousMemberList })"
      :label="$t('allowAnonymousMemberList')"
      :hint="$t('allowAnonymousMemberListHint')"
    />
    <input-update
      v-model="currencyValue"
      type="text"
      :label="$t('currencyValue')"
      :hint="$t('currencyValueHint')"
      standout
      class="input-standout-light"
      required
      :rules="[(val: string) => val.match(/^\d+(\/\d+)?$/) || $t('invalidCurrencyValue')]"
      hide-bottom-space
      :loading="currencyValueLoading"
    />
    <input-update
      v-model="externalTraderCreditLimit"
      :loading="externalTraderCreditLimitLoading"
    >
      <template #default="{modelValue, updateModelValue}">
        <amount-input
          :model-value="modelValue"
          :currency="currency"
          :label="$t('externalTraderCreditLimit')"
          :hint="$t('externalTraderCreditLimitHint')"
          standout
          class="input-standout-light"
          @update:model-value="updateModelValue"
        />
      </template>
    </input-update>
    <input-update
      v-model="externalTraderMaximumBalance"
      :loading="externalTraderMaximumBalanceLoading"
    >
      <template #default="{modelValue, updateModelValue}">
        <amount-input
          :model-value="modelValue"
          :currency="currency"
          :label="$t('externalTraderMaximumBalance')"
          :hint="$t('externalTraderMaximumBalanceHint')"
          standout
          class="input-standout-light"
          @update:model-value="updateModelValue"
        />
      </template>
    </input-update>
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('trustlines') }}
    </div>
    <div class="text-on-surface-medium">
      {{ $t('trustlinesText') }}
    </div>
    <community-trustlines :code="code" :save="save" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ToggleItem from '@/components/ToggleItem.vue'
import InputUpdate from '@/components/InputUpdate.vue'
import AmountInput from '@/components/AmountInput.vue'
import CommunityTrustlines from './CommunityTrustlines.vue'
import type { CurrencySettings } from '@/store/model'
import type { CommunitySettingsContext } from '@/composables/useCommunitySettings'

const { settingsContext } = defineProps<{ settingsContext: CommunitySettingsContext }>()
const {
  code, groupSettings, currency, currencySettings, updatingCurrency, updatingCurrencySettings,
  save, saveGroupSettings, saveCurrency, saveCurrencySettings
} = settingsContext
const allowAnonymousMemberList = ref(groupSettings.value.attributes.allowAnonymousMemberList ?? false)

// This ref selects the loading spinner
const lastCurrencySettingsUpdate = ref<"rate"|"settings"|"externalTraderCreditLimit"|"externalTraderMaximumBalance">()

// Currency

const currencyValue = ref(currency.value.attributes.rate.n + "/" + currency.value.attributes.rate.d)
const currencyValueLoading = computed(() => lastCurrencySettingsUpdate.value === "rate" && updatingCurrency.value)

watch(currencyValue, (value) => {
  lastCurrencySettingsUpdate.value = "rate"
  const [n,d] = value.split("/")
  return saveCurrency({
    rate: {
      n: parseInt(n),
      d: parseInt(d)
    }
  })
})

// Currency settings

const vals = currencySettings.value.attributes
const enableExternalPayments = ref(vals.enableExternalPayments ?? false)
const enableExternalPaymentRequests = ref(vals.enableExternalPaymentRequests ?? false)
const enableCreditCommonsPayments = ref(vals.enableCreditCommonsPayments ?? false)
const updateSettings = (attributes: Partial<CurrencySettings['attributes']>) => {
  lastCurrencySettingsUpdate.value = 'settings'
  return saveCurrencySettings(attributes)
}

// These two settings are updated separately because they imply a stellar transaction so
// they deserve a different UX (click to, show spinner).
const externalTraderCreditLimit = ref(vals.externalTraderCreditLimit ?? 0)
const externalTraderMaximumBalance = ref(vals.externalTraderMaximumBalance ?? 0)

watch(externalTraderCreditLimit, (value) => {
  lastCurrencySettingsUpdate.value = "externalTraderCreditLimit"
  return saveCurrencySettings({
    externalTraderCreditLimit: value
  })
})


const externalTraderCreditLimitLoading = computed(() => lastCurrencySettingsUpdate.value === "externalTraderCreditLimit" && updatingCurrencySettings.value)

watch(externalTraderMaximumBalance, (value) => {
  lastCurrencySettingsUpdate.value = "externalTraderMaximumBalance"
  return saveCurrencySettings({
    externalTraderMaximumBalance: value
  })
})
const externalTraderMaximumBalanceLoading = computed(() => lastCurrencySettingsUpdate.value === "externalTraderMaximumBalance" && updatingCurrencySettings.value)

</script>
