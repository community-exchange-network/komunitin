<template>
  <div class="q-gutter-y-md">
    <div 
      v-if="['allowPayments', 'allowPaymentRequests', 'allowExternalPayments', 'allowExternalPaymentRequests'].some(show)"
      class="text-overline text-uppercase text-onsurface-m"
    >
      {{ $t('transferDirections') }}
    </div>
    <toggle-item 
      v-if="show('allowPayments')"
      :model-value="settings.allowPayments"
      :label="$t('allowPayments')"
      :hint="$t('allowPaymentsHint')"
      :default-value="def?.allowPayments"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowPayments = $event"
    />
    <toggle-item 
      v-if="show('allowPaymentRequests')"
      :model-value="settings.allowPaymentRequests"
      :label="$t('allowPaymentRequests')"
      :hint="$t('allowPaymentRequestsHint')"
      :default-value="def?.allowPaymentRequests"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowPaymentRequests = $event"
    />
    <toggle-item
      v-if="show('allowExternalPayments')"
      :model-value="settings.allowExternalPayments"
      :label="$t('allowExternalPayments')"
      :hint="$t('allowExternalPaymentsHint')"
      :default-value="def?.allowExternalPayments"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowExternalPayments = $event"
    />
    <toggle-item
      v-if="show('allowExternalPaymentRequests')"
      :model-value="settings.allowExternalPaymentRequests"
      :label="$t('allowExternalPaymentRequests')"
      :hint="$t('allowExternalPaymentRequestsHint')"
      :default-value="def?.allowExternalPaymentRequests"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowExternalPaymentRequests = $event"
    />
    <div 
      v-if="['allowSimplePayments', 'allowSimplePaymentRequests', 'allowQrPayments', 'allowQrPaymentRequests', 'allowTagPayments', 'allowTagPaymentRequests', 'allowMultiplePayments', 'allowMultiplePaymentRequests'].some(show)"
      class="text-overline text-uppercase text-onsurface-m"
    >
      {{ $t('transferMethods') }}
    </div>
    <toggle-item
      v-if="show('allowSimplePayments')"
      :model-value="settings.allowSimplePayments"
      :label="$t('allowSimplePayments')"
      :hint="$t('allowSimplePaymentsHint')"
      :default-value="def?.allowSimplePayments"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowSimplePayments = $event"
    />
    <toggle-item
      v-if="show('allowSimplePaymentRequests')"
      :model-value="settings.allowSimplePaymentRequests"
      :label="$t('allowSimplePaymentRequests')"
      :hint="$t('allowSimplePaymentRequestsHint')"
      :default-value="def?.allowSimplePaymentRequests"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowSimplePaymentRequests = $event"
    />
    <toggle-item
      v-if="show('allowQrPayments')"
      :model-value="settings.allowQrPayments"
      :label="$t('allowQrPayments')"
      :hint="$t('allowQrPaymentsHint')"
      :default-value="def?.allowQrPayments"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowQrPayments = $event"
    />
    <toggle-item
      v-if="show('allowQrPaymentRequests')"
      :model-value="settings.allowQrPaymentRequests"
      :label="$t('allowQrPaymentRequests')"
      :hint="$t('allowQrPaymentRequestsHint')"
      :default-value="def?.allowQrPaymentRequests"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowQrPaymentRequests = $event"
    />
    <toggle-item
      v-if="show('allowTagPayments')"
      :model-value="settings.allowTagPayments"
      :label="$t('allowTagPayments')"
      :hint="$t('allowTagPaymentsHint')"
      :default-value="def?.allowTagPayments"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowTagPayments = $event"
    />
    <toggle-item
      v-if="show('allowTagPaymentRequests')"
      :model-value="settings.allowTagPaymentRequests"
      :label="$t('allowTagPaymentRequests')"
      :hint="$t('allowTagPaymentRequestsHint')"
      :default-value="def?.allowTagPaymentRequests"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowTagPaymentRequests = $event"
    />
    <toggle-item
      v-if="show('allowMultiplePayments')"
      :model-value="settings.allowMultiplePayments"
      :label="$t('allowMultiplePayments')"
      :hint="$t('allowMultiplePaymentsHint')"
      :default-value="def?.allowMultiplePayments"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowMultiplePayments = $event"
    />
    <toggle-item
      v-if="show('allowMultiplePaymentRequests')"
      :model-value="settings.allowMultiplePaymentRequests"
      :label="$t('allowMultiplePaymentRequests')"
      :hint="$t('allowMultiplePaymentRequestsHint')"
      :default-value="def?.allowMultiplePaymentRequests"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.allowMultiplePaymentRequests = $event"
    />
    <div 
      v-if="['acceptPaymentsAutomatically', 'acceptPaymentsAfter', 'acceptExternalPaymentsAutomatically'].some(show)"
      class="text-overline text-uppercase text-onsurface-m"
    >
      {{ $t('paymentRequests') }}
    </div>
    <toggle-item 
      v-if="show('acceptPaymentsAutomatically')"
      :model-value="settings.acceptPaymentsAutomatically"
      :label="$t('acceptPaymentsAutomatically')"
      :hint="$t('acceptPaymentsHint')"
      :default-value="def?.acceptPaymentsAutomatically"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.acceptPaymentsAutomatically = $event"
    />
    <toggle-item
      v-if="show('acceptPaymentAfter')"
      :model-value="enableAcceptPaymentsAfter"
      :label="$t('enableAcceptPaymentsAfter2w')"
      :hint="$t('enableAcceptPaymentsAfter2wHint')"
      :default-value="def?.acceptPaymentsAfter !== undefined"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="enableAcceptPaymentsAfter = $event"
    />
    <toggle-item
      v-if="show('acceptExternalPaymentsAutomatically')"
      :model-value="settings.acceptExternalPaymentsAutomatically"
      :label="$t('acceptExternalPaymentsAutomatically')"
      :hint="$t('acceptExternalPaymentsAutomaticallyHint')"
      :default-value="def?.acceptExternalPaymentsAutomatically"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.acceptExternalPaymentsAutomatically = $event"
    />
    <div 
      v-if="['creditLimit', 'maximumBalance', 'onPaymentCreditLimit'].some(show)"
      class="text-overline text-uppercase text-onsurface-m"
    >
      {{ $t('limits') }}
    </div>
    <input-update
      v-if="show('creditLimit')"
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
          outlined
          @update:model-value="updateModelValue"
        />
      </template>
    </input-update>
    <input-update
      v-if="show('maximumBalance')"
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
          outlined
          disable
          @update:model-value="updateModelValue"
        />
      </template>
    </input-update>
    <toggle-item
      v-if="show('onPaymentCreditLimit')"
      v-model="enableOnPaymentCreditLimit"
      :label="$t('enableOnPaymentCreditLimit')"
      :hint="$t('enableOnPaymentCreditLimitHint')"
      :toggle-indeterminate="props.indeterminateStates"
      :default-value="(def === undefined) ? undefined : (def.onPaymentCreditLimit !== undefined)"
    />
    <amount-input
      v-if="show('onPaymentCreditLimit')"
      v-model="onPaymentCreditLimitValue"
      :currency="currency"
      :label="$t('onPaymentCreditLimit')"
      outlined
      :disable="!enableOnPaymentCreditLimit"
    />
    <div 
      v-if="['hideBalance'].some(show)"
      class="text-overline text-uppercase text-onsurface-m"
    >
      {{ $t('privacy') }}
    </div>
    <toggle-item
      v-if="show('hideBalance')"
      :model-value="settings.hideBalance"
      :label="$t('hideBalance')"
      :hint="$t('hideBalanceHint')"
      :default-value="def?.hideBalance"
      :toggle-indeterminate="props.indeterminateStates"
      @update:model-value="settings.hideBalance = $event as boolean | undefined"
    />
  </div>
  
</template>
<script setup lang="ts">
/**
 * This component shows the UI for editing the account settings and also the
 * account credit limit and maximum balance. It is meant to be used either by
 * the admin or the account owner, and also for editing the part of the 
 * currency settings that are defaults for account settings.
 */
import ToggleItem from "src/components/ToggleItem.vue"
import AmountInput from "src/components/AmountInput.vue"
import InputUpdate from "src/components/InputUpdate.vue"

import { AccountSettings, Currency } from "src/store/model"
import { ref, watch, computed } from "vue"
import { useStore } from "vuex"

const props = defineProps<{
  currency: Currency

  creditLimit?: number,
  creditLimitLoading?: boolean,

  maximumBalance?: number|undefined,
  maximumBalanceLoading?: boolean,

  settings: AccountSettings,
  defaults?: AccountSettings,

  indeterminateStates?: boolean,

  limits?: boolean,
}>()

const emit = defineEmits<{
  (e: 'update:creditLimit', value: number): void
  (e: 'update:maximumBalance', value: number|undefined): void
  (e: 'update:settings', value: AccountSettings): void
}>()

// In future this list could be configurable by the currency.
const userEditableSettings = [
  "acceptPaymentsAutomatically",
  // "acceptPaymentsWhitelist", 
  "acceptExternalPaymentsAutomatically",
  // "tags"
]

// Settings controlled by the limits prop.
const limitsSettings = [
  "creditLimit",
  "maximumBalance",
]

const store = useStore()
const isAdmin = computed(() => store.getters.isAdmin)

const show = (key: string) => {
  if (limitsSettings.includes(key) && !props.limits) {
    return false
  }
  if (!isAdmin.value && !userEditableSettings.includes(key)) {
    return false
  }
  return true
}

const creditLimit = computed({
  get: () => (props.creditLimit ?? 0),
  set: (value: number) => emit('update:creditLimit', value)
})
const maximumBalance = computed<number>({
  get: () => props.maximumBalance ?? 0,
  set: (value: number|undefined) => emit('update:maximumBalance', value === 0 ? undefined : value)
})

const settings = ref(props.settings.attributes)
const def = computed(() => props.defaults?.attributes)

const enableAcceptPaymentsAfter = computed({
  get: () => (settings.value.acceptPaymentsAfter === undefined || settings.value.acceptPaymentsAfter === null) ? null : settings.value.acceptPaymentsAfter !== false,
  set: (value: boolean | null) => {
    if (value !== null) {
      settings.value.acceptPaymentsAfter = value ? 14*24*60*60 : false
    } else {
      settings.value.acceptPaymentsAfter = null
    }
  }
})

const enableOnPaymentCreditLimit = ref(settings.value.onPaymentCreditLimit === undefined || settings.value.onPaymentCreditLimit == null ? null : settings.value.onPaymentCreditLimit !== false)
const onPaymentCreditLimitValue = ref(settings.value.onPaymentCreditLimit ?? def.value?.onPaymentCreditLimit ?? 0)
watch([enableOnPaymentCreditLimit, onPaymentCreditLimitValue], ([enable, value]) => {
  settings.value.onPaymentCreditLimit = enable ? value : undefined
})

watch(settings, (value) => {
  emit('update:settings', {
    ...props.settings,
    attributes: {
      ...value
    }
  })
}, {deep: true})

</script>