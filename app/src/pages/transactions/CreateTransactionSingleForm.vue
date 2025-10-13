<template>
  <q-form @submit="onSubmit">
    <div class="q-gutter-y-lg column">  
      <div>
        <div class="text-subtitle1">
          {{ $t('enterTransactionData') }}
        </div>
        <div class="text-onsurface-m">
          {{ text }}
        </div>
      </div>
      <select-account
        v-if="selectPayer"
        v-model="payerAccountValue"
        name="payer"
        :code="code"
        :payer="true"
        :change-group="myCurrency.settings.attributes.enableExternalPaymentRequests"
        :label="$t('selectPayer')"
        :hint="$t('transactionPayerHint')"
        :rules="[() => !v$.payerAccount?.$error || $t('payerRequired')]"
        outlined
        @blur="v$.payerAccount?.$touch()"
      />
      <select-account
        v-if="selectPayee"
        v-model="payeeAccountValue"
        name="payee"
        :code="code"
        :payer="false"
        :change-group="myCurrency.settings.attributes.enableExternalPayments"
        :label="$t('selectPayee')"
        :hint="$t('transactionPayeeHint')"
        :rules="[() => !v$.payeeAccount?.$error || $t('payeeRequired')]"
        outlined
        @blur="v$.payeeAccount?.$touch()"
      />
      <q-input 
        v-model="concept"
        name="description"  
        :label="$t('description')" 
        :hint="$t('transactionDescriptionHint')" 
        outlined 
        autogrow 
        required
        :rules="[() => !v$.concept.$invalid || $t('descriptionRequired')]"
      >
        <template #append>
          <q-icon name="notes" />
        </template>
      </q-input>
      <q-input 
        v-model="amount"
        name="amount"
        :label="$t('amountIn', {currency: myCurrency.attributes.namePlural})"
        :hint="$t('transactionAmountHint')"
        outlined
        required
        :rules="[
          () => !v$.amount.$invalid || $t('invalidAmount'),
        ]"
      >
        <template #append>
          <span class="text-h6 text-onsurface-m">{{ myCurrency.attributes.symbol }}</span>
        </template>
      </q-input>
      <q-input
        v-if="otherCurrency"
        :model-value="otherAmount"
        readonly
        disabled
        outlined
        :label="$t('amountIn', {currency: otherCurrency.attributes.namePlural})"
      >
        <template #append>
          <span class="text-h6 text-onsurface-m">{{ otherCurrency.attributes.symbol }}</span>
        </template>
      </q-input>
      <q-btn
        :label="submitLabel"
        type="submit"
        color="primary"
        :disabled="v$.$invalid"
        unelevated
      />
    </div>
  </q-form>
</template>
<script setup lang="ts">
import { useVuelidate } from "@vuelidate/core"
import { minValue, numeric, required } from "@vuelidate/validators"
import type { DeepPartial } from "quasar"
import KError, { KErrorCode } from "src/KError"
import SelectAccount from "src/components/SelectAccount.vue"
import { transferAccountRelationships } from "src/composables/fullAccount"
import formatCurrency, { convertCurrency } from "src/plugins/FormatCurrency"
import type { Account, Currency, CurrencySettings, Member, Transfer } from "src/store/model"
import { v4 as uuid } from "uuid"
import { computed, ref } from "vue"
import { useStore } from "vuex"

const props = defineProps<{
  modelValue: DeepPartial<Transfer> | undefined,
  code: string,
  selectPayer: boolean,
  payerAccount?: Account & {currency: Currency, member?: Member},
  selectPayee: boolean,
  payeeAccount?: Account & {currency: Currency, member?: Member},
  text: string,
  submitLabel: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', transfer: DeepPartial<Transfer>): void
}>()

const store = useStore()
const myCurrency = computed<Currency & {settings: CurrencySettings}>(() => store.getters.myAccount.currency)

const transfer = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const payerAccountValue = ref(props.payerAccount)
const payeeAccountValue = ref(props.payeeAccount)
const concept = ref(transfer.value?.attributes?.meta?.description)
const amount = ref<number|undefined>(props.modelValue?.attributes?.amount ? props.modelValue.attributes.amount / Math.pow(10, myCurrency.value.attributes.scale) : undefined)

// Validation.
const isAccount = (account: Account|undefined) => (account && account.id !== undefined)

const rules = computed(() => ({
  ...(props.selectPayer && {payerAccount: {isAccount}}),
  ...(props.selectPayee && {payeeAccount: {isAccount}}),
  concept: { required },
  amount: { required, numeric, nonNegative: minValue(0)}
}))

const v$ = useVuelidate(rules, {
  ...(props.selectPayer && {payerAccount: payerAccountValue}),
  ...(props.selectPayee && {payeeAccount: payeeAccountValue}),
  concept, 
  amount
});

const otherCurrency = computed(() =>  {
  if (props.selectPayer && payerAccountValue.value && payerAccountValue.value.currency.id !== myCurrency.value.id) {
    return payerAccountValue.value.currency
  } else if (props.selectPayee && payeeAccountValue.value && payeeAccountValue.value.currency.id !== myCurrency.value.id) {
    return payeeAccountValue.value.currency
  }
  return null
})

const otherAmount = computed(() => {
  if (otherCurrency.value && amount.value) {
    const num = convertCurrency(amount.value, myCurrency.value, otherCurrency.value)
    return formatCurrency(num, otherCurrency.value, {symbol: false, scale: false})
  } else {
    return null
  }
})

const onSubmit = () => {
  if (amount.value === undefined) {
    throw new KError(KErrorCode.ScriptError, "Amount must be defined before submit.")
  }

  const transferAmount = Math.round(amount.value * Math.pow(10, myCurrency.value.attributes.scale))

  // Build transfer object
  const value = {
    id: uuid(),
    type: "transfers",
    attributes: {
      amount: transferAmount,
      meta: {
        description: concept.value,
      },
      state: "new",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    relationships: transferAccountRelationships(payerAccountValue.value, payeeAccountValue.value, myCurrency.value),
  };
  
  // This operation is not the same as just doing transfer.value = value,
  // because the store adds some attributes to the transfer (such as transfer.payer, etc).
  store.dispatch("transfers/setCurrent", value)
  transfer.value = store.getters["transfers/current"]
}

</script>