<template>
  <q-form @submit="onSubmit">
    <div class="q-gutter-y-lg">  
      <div>
        <div class="text-subtitle1">
          {{ $t('enterMultipleTransactions') }}
        </div>
        <div class="text-onsurface-m">
          {{ $t('enterMultipleTransactionsText') }}
        </div>
      </div>
      <div>
        <q-toggle
          v-model="copyDescription"
          :label="$t('copyDescription')"
        />
        <q-input
          v-if="copyDescription"
          v-model="description"
          class="q-mt-md"
          :label="$t('description')"
          :hint="$t('transactionDescriptionHint')" 
          outlined
          required
          :rules="[() => (description !== '') || $t('ErrorDescriptionRequired')]"
        />
      </div>
      <div>
        <create-transaction-load-file-btn
          :direction="direction"
          :code="code"
          :payer-account="payerAccount"
          :payee-account="payeeAccount"
          @import="onImport"
        />
      </div>
      <q-table
        class="text-onsurface-m full-width"
        :rows="rows"
        :columns="columns"
        :visible-columns="copyDescription ? [] : ['description']"
        flat
      >
        <template #body="slot">
          <q-tr :props="slot">
            <q-td 
              key="index"  
              :props="slot"
              auto-width
            >
              {{ slot.rowIndex + 1 }}
            </q-td>
            <q-td 
              v-if="selectPayer"
              key="payer"
              :props="slot"
            >
              <select-account
                v-model="slot.row.payer"
                :name="`payer[${slot.rowIndex}]`"
                :code="code"
                :payer="true"
                :change-group="myCurrency.settings.attributes.enableExternalPaymentRequests"
                borderless
                :lazy="slot.rowIndex > 0"
                :rules="[() => emptyRow(slot.row) || checkPayer(slot.row) || $t('payerRequired')]"
                hide-bottom-space
              />
            </q-td>
            <q-td 
              v-if="selectPayee"
              key="payee"
              :props="slot"
            >
              <select-account
                v-model="slot.row.payee"
                :name="`payee[${slot.rowIndex}]`"
                :code="code"
                :payer="false"
                :change-group="myCurrency.settings.attributes.enableExternalPayments"
                borderless
                :lazy="slot.rowIndex > 0"
                :rules="[() => emptyRow(slot.row) || checkPayee(slot.row) || $t('payeeRequired')]"
                hide-bottom-space
              />
            </q-td>
            <q-td 
              key="description"
              :props="slot" 
            >
              <q-input
                v-model="slot.row.description"
                :name="`description[${slot.rowIndex}]`"
                borderless
                :rules="[() => emptyRow(slot.row) || checkDescription(slot.row) || $t('ErrorDescriptionRequired')]"
                hide-bottom-space
              />
            </q-td>
            <q-td 
              key="amount"
              :props="slot"
              auto-width
            >
              <q-input
                v-model="slot.row.amount"
                :name="`amount[${slot.rowIndex}]`"
                input-class="text-right"
                borderless
                :rules="[() => emptyRow(slot.row) || checkAmount(slot.row) || $t('ErrorInvalidAmount')]"
                hide-bottom-space
              />
            </q-td>
          </q-tr>
        </template>
      </q-table>
      <div class="row justify-center q-mt-lg q-mb-xl">
        <div class="col-12 col-sm-8 col-md-6">
          <div 
            v-if="invalidRows.length > 0" 
            class="text-caption text-center text-negative q-my-md"
          >
            {{ $t('errorInRows', {rows: invalidRows.join(", ")}) }}
          </div>
          <q-btn
            class="full-width"
            :label="submitLabel"
            type="submit"
            color="primary"
            :disable="!isValid"
            unelevated     
          />
        </div>
      </div>
    </div>
  </q-form>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SelectAccount from 'src/components/SelectAccount.vue'
import CreateTransactionLoadFileBtn from "./CreateTransactionLoadFileBtn.vue"
import type { TransferRow } from './CreateTransactionMultiple.vue'
import { useI18n } from 'vue-i18n'
import type { Currency, CurrencySettings, ExtendedAccount } from 'src/store/model'
import { useStore } from 'vuex'

const props = defineProps<{
  modelValue?: TransferRow[],
  code: string,
  direction: "send" | "receive" | "transfer",
  selectPayer: boolean,
  selectPayee: boolean,
  payerAccount: ExtendedAccount | undefined,
  payeeAccount: ExtendedAccount | undefined
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', transfers: TransferRow[]): void
}>()

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const store = useStore()
const myCurrency = computed<Currency & {settings: CurrencySettings}>(() => store.getters.myAccount.currency)

const copyDescription = ref(false)
const description = ref("")

// All columns are marked required (but the "description" column) so we just care about hiding this col
// when the user wants to copy the description to all rows.
const accountColumnStyle = computed(() => {
  if (copyDescription.value) {
    return undefined
  } else if (props.selectPayer && props.selectPayee) {
    return "width: 25%"
  } else {
    return "width: 33%"
  }
})

const columns = computed(() => [
  {name: 'index', label: "#", align: 'right', field: 'index', required: true},
  ...(props.selectPayer ? [{name: 'payer', label: t("payer"), align: 'left', field: 'payer', required: true, headerStyle: accountColumnStyle.value}] : []),
  ...(props.selectPayee ? [{name: 'payee', label: t("payee"), align: 'left', field: 'payee', required: true, headerStyle: accountColumnStyle.value}] : []),
  {name: 'description', label: t("description"), align: 'left', field: 'description'},
  {name: 'amount', label: t("amountIn", {currency: myCurrency.value.attributes.namePlural}), align: 'right', field: 'amount', required: true},
])

// Add new empty rows at start
const rows = ref<(TransferRow|object)[]>(model.value ?? Array.from({length: 5}, () => ({})))

// and when the last row is filled
watch(() => rows.value[rows.value.length - 1], (lastRow) => {
  if (Object.keys(lastRow).length > 0) {
    rows.value.push(...(Array.from({length: 5}, () => ({}))))
  }
}, {deep: true})

// Validation
const emptyRow = (row: TransferRow) => {
  return Object.keys(row).length === 0
}
const checkDescription = (row: TransferRow) => {
  return copyDescription.value || !!row.description?.trim()
}
const checkPayer = (row: TransferRow) => {
  return !!row.payer
}
const checkPayee = (row: TransferRow) => {
  return !!row.payee
}
const checkAmount = (row: TransferRow) => {
  return !!row.amount && (Number(row.amount) > 0)
}
const checkRow = (row: TransferRow) => {
  return emptyRow(row) ||
    checkDescription(row) && checkAmount(row) 
    && (props.selectPayer ? checkPayer(row) : true) 
    && (props.selectPayee ? checkPayee(row) : true)
}
const invalidRows = computed(() => {
  return rows.value.map((row, index) => checkRow(row) ? undefined : index + 1)
    .filter((index) => index !== undefined)
})

const isValid = computed(() => {
  return invalidRows.value.length === 0 && !rows.value.every(emptyRow) && (!copyDescription.value || description.value !== "")
})

// Import file
const onImport = (imported: TransferRow[]) => {
  rows.value = imported
}

// Submit
const { t } = useI18n()
const submitLabel = computed(() => {
  switch (props.direction) {
    case "send":
      return t("sendPayments")
    case "receive":
      return t("receivePayments")
    default:
      return t("submitTransactions")
  }
})

const onSubmit = () => {
  model.value = rows.value
    .filter((row) => !emptyRow(row))
    .map((row: TransferRow) => ({
      payer: row.payer,
      payee: row.payee,
      description: copyDescription.value ? description.value : row.description,
      amount: row.amount
    }))
}

</script>