<template>
  <div class="q-gutter-y-lg">
    <div>
      <h1 class="text-title-medium q-ma-none">
        {{ $t('signupSettings') }}
      </h1>
      <div class="text-on-surface-medium">
        {{ $t('signupSettingsText') }}
      </div>
    </div>
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('termsOfUse') }}
    </div>
    <toggle-item
      v-model="requireAcceptTerms"
      @update:model-value="saveGroupSettings({ requireAcceptTerms })"
      :label="$t('enableTermsOfUse')"
      :hint="$t('enableTermsOfUseHint')"
    />
    <q-input
      :model-value="terms"
      type="textarea"
      :label="$t('termsOfUse')"
      standout
      class="input-standout-light"
      autogrow
      :debounce="1000"
      input-style="min-height: 100px;"
      @update:model-value="updateTerms"
    />
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('offersAndNeeds') }}
    </div>
    <q-input
      v-model.number="minOffers"
      @update:model-value="saveGroupSettings({ minOffers })"
      type="number"
      :label="$t('minOffers')"
      :hint="$t('minOffersHint')"
      min="0"
      max="5"
      standout
      class="input-standout-light"
    />
    <q-input
      v-model.number="minNeeds"
      @update:model-value="saveGroupSettings({ minNeeds })"
      type="number"
      :label="$t('minNeeds')"
      :hint="$t('minNeedsHint')"
      min="0"
      max="5"
      standout
      class="input-standout-light"
    />
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('accountStart') }}
    </div>
    <amount-input
      v-model="defaultInitialCreditLimit"
      @update:model-value="saveCurrencySettings({ defaultInitialCreditLimit })"
      :label="$t('initialCredit')"
      :hint="$t('initialCreditHint')"
      :currency="currency"
      standout
      class="input-standout-light"
    />
    <amount-input
      v-model="defaultInitialMaximumBalance"
      @update:model-value="saveCurrencySettings({ defaultInitialMaximumBalance })"
      :label="$t('maximumBalance')"
      :hint="$t('initialMaximumBalanceHint')"
      :currency="currency"
      standout
      class="input-standout-light"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ToggleItem from '@/components/ToggleItem.vue'
import AmountInput from '@/components/AmountInput.vue'
import type { CommunitySettingsContext } from '@/composables/useCommunitySettings'

const { settingsContext } = defineProps<{ settingsContext: CommunitySettingsContext }>()
const { groupSettings, currency, currencySettings, saveGroupSettings, saveCurrencySettings } = settingsContext

const requireAcceptTerms = ref(groupSettings.value.attributes.requireAcceptTerms ?? false)
const terms = ref(groupSettings.value.attributes.terms ?? '')
const minOffers = ref(groupSettings.value.attributes.minOffers ?? 0)
const minNeeds = ref(groupSettings.value.attributes.minNeeds ?? 0)
// QInput also flushes its debounced value when the section is closed.
const updateTerms = (value: string | number | null) => {
  terms.value = String(value ?? '')
  return saveGroupSettings({ terms: terms.value })
}

const defaultInitialCreditLimit = ref(currencySettings.value.attributes.defaultInitialCreditLimit ?? 0)
const defaultInitialMaximumBalance = ref(currencySettings.value.attributes.defaultInitialMaximumBalance ?? 0)
</script>
