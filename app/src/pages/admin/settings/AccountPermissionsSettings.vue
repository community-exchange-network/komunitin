<template>
  <div class="q-gutter-y-lg">
    <div>
      <h1 class="text-title-medium q-ma-none">
        {{ $t('accountPermissions') }}
      </h1>
      <div class="text-on-surface-medium">
        {{ $t('accountDefaultsText') }}
      </div>
    </div>
    <account-permissions-fields
      :settings="accountSettings"
      @update:settings="updateSettings"
    />
  </div>
</template>

<script setup lang="ts">
import AccountPermissionsFields from '@/pages/settings/account/AccountPermissionsFields.vue'
import type { CommunitySettingsContext } from '@/composables/useCommunitySettings'
import { useAccountDefaultSettings } from '@/composables/accountSettings'

const { settingsContext } = defineProps<{ settingsContext: CommunitySettingsContext }>()
const { currencySettings, saveCurrencySettings } = settingsContext
const { accountSettings, updateSettings } = useAccountDefaultSettings(currencySettings.value, saveCurrencySettings)
</script>
