<template>
  <div
    v-if="isAdmin"
    class="q-gutter-y-md"
  >
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('transferDirections') }}
    </div>
    <toggle-item
      :model-value="settings.allowPayments"
      :label="$t('allowPayments')"
      :hint="$t('allowPaymentsHint')"
      :default-value="defaults?.allowPayments"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowPayments: $event })"
    />
    <toggle-item
      :model-value="settings.allowPaymentRequests"
      :label="$t('allowPaymentRequests')"
      :hint="$t('allowPaymentRequestsHint')"
      :default-value="defaults?.allowPaymentRequests"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowPaymentRequests: $event })"
    />
    <toggle-item
      :model-value="settings.allowExternalPayments"
      :label="$t('allowExternalPayments')"
      :hint="$t('allowExternalPaymentsHint')"
      :default-value="defaults?.allowExternalPayments"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowExternalPayments: $event })"
    />
    <toggle-item
      :model-value="settings.allowExternalPaymentRequests"
      :label="$t('allowExternalPaymentRequests')"
      :hint="$t('allowExternalPaymentRequestsHint')"
      :default-value="defaults?.allowExternalPaymentRequests"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowExternalPaymentRequests: $event })"
    />
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('transferMethods') }}
    </div>
    <toggle-item
      :model-value="settings.allowSimplePayments"
      :label="$t('allowSimplePayments')"
      :hint="$t('allowSimplePaymentsHint')"
      :default-value="defaults?.allowSimplePayments"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowSimplePayments: $event })"
    />
    <toggle-item
      :model-value="settings.allowSimplePaymentRequests"
      :label="$t('allowSimplePaymentRequests')"
      :hint="$t('allowSimplePaymentRequestsHint')"
      :default-value="defaults?.allowSimplePaymentRequests"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowSimplePaymentRequests: $event })"
    />
    <toggle-item
      :model-value="settings.allowQrPayments"
      :label="$t('allowQrPayments')"
      :hint="$t('allowQrPaymentsHint')"
      :default-value="defaults?.allowQrPayments"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowQrPayments: $event })"
    />
    <toggle-item
      :model-value="settings.allowQrPaymentRequests"
      :label="$t('allowQrPaymentRequests')"
      :hint="$t('allowQrPaymentRequestsHint')"
      :default-value="defaults?.allowQrPaymentRequests"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowQrPaymentRequests: $event })"
    />
    <toggle-item
      :model-value="settings.allowTagPayments"
      :label="$t('allowTagPayments')"
      :hint="$t('allowTagPaymentsHint')"
      :default-value="defaults?.allowTagPayments"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowTagPayments: $event })"
    />
    <toggle-item
      :model-value="settings.allowTagPaymentRequests"
      :label="$t('allowTagPaymentRequests')"
      :hint="$t('allowTagPaymentRequestsHint')"
      :default-value="defaults?.allowTagPaymentRequests"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowTagPaymentRequests: $event })"
    />
    <toggle-item
      :model-value="settings.allowMultiplePayments"
      :label="$t('allowMultiplePayments')"
      :hint="$t('allowMultiplePaymentsHint')"
      :default-value="defaults?.allowMultiplePayments"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowMultiplePayments: $event })"
    />
    <toggle-item
      :model-value="settings.allowMultiplePaymentRequests"
      :label="$t('allowMultiplePaymentRequests')"
      :hint="$t('allowMultiplePaymentRequestsHint')"
      :default-value="defaults?.allowMultiplePaymentRequests"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { allowMultiplePaymentRequests: $event })"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import ToggleItem from '@/components/ToggleItem.vue'
import type { AccountSettings } from '@/store/model'

defineProps<{
  settings: AccountSettings['attributes']
  defaults?: AccountSettings['attributes']
  indeterminateStates?: boolean
}>()
const emit = defineEmits<{
  'update:settings': [attributes: Partial<AccountSettings['attributes']>]
}>()

const store = useStore()
const isAdmin = computed(() => store.getters.isAdmin || store.getters.isSuperadmin)
</script>
