<template>
  <div class="q-gutter-y-md">
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('paymentRequests') }}
    </div>
    <toggle-item
      :model-value="settings.acceptPaymentsAutomatically"
      :label="$t('acceptPaymentsAutomatically')"
      :hint="$t('acceptPaymentsHint')"
      :default-value="defaults?.acceptPaymentsAutomatically"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { acceptPaymentsAutomatically: $event })"
    />
    <toggle-item
      v-if="isAdmin"
      :model-value="enableAcceptPaymentsAfter"
      :label="$t('enableAcceptPaymentsAfter2w')"
      :hint="$t('enableAcceptPaymentsAfter2wHint')"
      :default-value="defaults?.acceptPaymentsAfter !== undefined"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="enableAcceptPaymentsAfter = $event"
    />
    <toggle-item
      :model-value="settings.acceptExternalPaymentsAutomatically"
      :label="$t('acceptExternalPaymentsAutomatically')"
      :hint="$t('acceptExternalPaymentsAutomaticallyHint')"
      :default-value="defaults?.acceptExternalPaymentsAutomatically"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { acceptExternalPaymentsAutomatically: $event })"
    />
    <div
      v-if="isAdmin"
      class="text-label-medium-uppercase text-on-surface-medium"
    >
      {{ $t('limits') }}
    </div>
    <input-update
      v-if="isAdmin && limits"
      v-model="creditLimit"
      :loading="creditLimitLoading"
    >
      <template #default="{modelValue, updateModelValue}">
        <amount-input
          :model-value="modelValue"
          :currency="currency"
          :label="$t('creditLimit')"
          :hint="$t('creditLimitHint')"
          hide-bottom-space
          standout
          class="input-standout-light"
          @update:model-value="updateModelValue"
        />
      </template>
    </input-update>
    <input-update
      v-if="isAdmin && limits"
      v-model="maximumBalance"
      :loading="maximumBalanceLoading"
    >
      <template #default="{modelValue, updateModelValue}">
        <amount-input
          :model-value="modelValue"
          :currency="currency"
          :label="$t('maximumBalance')"
          :hint="$t('maximumBalanceHint')"
          hide-bottom-space
          standout
          class="input-standout-light"
          @update:model-value="updateModelValue"
        />
      </template>
    </input-update>
    <toggle-item
      v-if="isAdmin"
      v-model="enableOnPaymentCreditLimit"
      :label="$t('enableOnPaymentCreditLimit')"
      :hint="$t('enableOnPaymentCreditLimitHint')"
      :toggle-indeterminate="indeterminateStates"
      :default-value="(defaults === undefined) ? undefined : (defaults.onPaymentCreditLimit !== undefined)"
    />
    <amount-input
      v-if="isAdmin"
      v-model="onPaymentCreditLimitValue"
      :currency="currency"
      :label="$t('onPaymentCreditLimit')"
      standout
      class="input-standout-light"
      :disable="!enableOnPaymentCreditLimit"
    />
    <div
      v-if="isAdmin"
      class="text-label-medium-uppercase text-on-surface-medium"
    >
      {{ $t('privacy') }}
    </div>
    <toggle-item
      v-if="isAdmin"
      :model-value="settings.hideBalance"
      :label="$t('hideBalance')"
      :hint="$t('hideBalanceHint')"
      :default-value="defaults?.hideBalance"
      :toggle-indeterminate="indeterminateStates"
      @update:model-value="emit('update:settings', { hideBalance: $event })"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import AmountInput from '@/components/AmountInput.vue'
import InputUpdate from '@/components/InputUpdate.vue'
import ToggleItem from '@/components/ToggleItem.vue'
import type { AccountSettings, Currency } from '@/store/model'

const props = defineProps<{
  currency: Currency
  settings: AccountSettings['attributes']
  defaults?: AccountSettings['attributes']
  creditLimit?: number
  creditLimitLoading?: boolean
  maximumBalance?: number
  maximumBalanceLoading?: boolean
  indeterminateStates?: boolean
  limits?: boolean
}>()
const emit = defineEmits<{
  'update:settings': [attributes: Partial<AccountSettings['attributes']>]
  'update:creditLimit': [value: number]
  'update:maximumBalance': [value: number | undefined]
}>()

const store = useStore()
const isAdmin = computed(() => store.getters.isAdmin || store.getters.isSuperadmin)

const creditLimit = computed({
  get: () => props.creditLimit ?? 0,
  set: (value: number) => emit('update:creditLimit', value)
})
const maximumBalance = computed({
  get: () => props.maximumBalance ?? 0,
  set: (value: number | undefined) => emit('update:maximumBalance', value === 0 ? undefined : value)
})
const enableAcceptPaymentsAfter = computed({
  get: () => props.settings.acceptPaymentsAfter == null ? null : props.settings.acceptPaymentsAfter !== false,
  set: (value: boolean | null) => emit('update:settings', { acceptPaymentsAfter: value === null ? null : value ? 14 * 24 * 60 * 60 : false })
})
const enableOnPaymentCreditLimit = ref(props.settings.onPaymentCreditLimit == null ? null : props.settings.onPaymentCreditLimit !== false)
const onPaymentCreditLimitValue = ref(props.settings.onPaymentCreditLimit ?? props.defaults?.onPaymentCreditLimit ?? 0)
watch([enableOnPaymentCreditLimit, onPaymentCreditLimitValue], ([enable, value]) => {
  emit('update:settings', { onPaymentCreditLimit: enable ? value : undefined })
})
</script>
