<template>
  <div class="q-gutter-y-lg">
    <div>
      <h1 class="text-title-medium q-ma-none">
        {{ $t('accountPreferences') }}
      </h1>
      <div class="text-on-surface-medium">
        {{ $t('accountDefaultsText') }}
      </div>
    </div>
    <account-preferences-fields
      :settings="accountSettings"
      :currency="currency"
      :limits="false"
      @update:settings="updateSettings"
    />
  </div>
</template>

<script setup lang="ts">
import AccountPreferencesFields from '@/pages/settings/account/AccountPreferencesFields.vue'
import type { CommunitySettingsContext } from '@/composables/useCommunitySettings'
import { useAccountDefaultSettings } from '@/composables/accountSettings'

const { settingsContext } = defineProps<{ settingsContext: CommunitySettingsContext }>()
const { currency, currencySettings, saveCurrencySettings } = settingsContext
const { accountSettings, updateSettings } = useAccountDefaultSettings(currencySettings.value, saveCurrencySettings)
</script>
