<template>
  <div class="q-gutter-y-md">
    <account-permissions-fields
      :settings="settings.attributes"
      :defaults="defaults?.attributes"
      :indeterminate-states="indeterminateStates"
      @update:settings="updateSettings"
    />
    <account-preferences-fields
      v-bind="props"
      :settings="settings.attributes"
      :defaults="defaults?.attributes"
      @update:settings="updateSettings"
      @update:credit-limit="emit('update:creditLimit', $event)"
      @update:maximum-balance="emit('update:maximumBalance', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import AccountPermissionsFields from './AccountPermissionsFields.vue'
import AccountPreferencesFields from './AccountPreferencesFields.vue'
import type { AccountSettings, Currency } from '@/store/model'

const props = defineProps<{
  currency: Currency
  settings: AccountSettings
  defaults?: AccountSettings
  creditLimit?: number
  creditLimitLoading?: boolean
  maximumBalance?: number
  maximumBalanceLoading?: boolean
  indeterminateStates?: boolean
  limits?: boolean
}>()
const emit = defineEmits<{
  'update:settings': [settings: AccountSettings]
  'update:creditLimit': [value: number]
  'update:maximumBalance': [value: number | undefined]
}>()

const updateSettings = (attributes: Partial<AccountSettings['attributes']>) => emit('update:settings', {
  ...props.settings,
  attributes: { ...props.settings.attributes, ...attributes }
})
</script>
