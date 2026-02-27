<template>
  <div class="row justify-center">
    <div class="q-py-lg q-px-md col-12 col-sm-8 col-lg-6">
      <create-transaction-single-form 
        v-if="state !== 'loading'"
        v-show="state === 'define'"
        :code="code"
        :select-payer="selectPayer"
        :payer-account="payerAccount"
        :select-payee="selectPayee"
        :payee-account="payeeAccount"
        :currency="currency"
        :text="text"
        :submit-label="submitLabel"
        :model-value="transfer"
        @update:model-value="onFilled"
      />
      <create-transaction-single-confirm
        v-if="state === 'confirm'"
        :code="code"
        :transfer="transfer"
        @back="state = 'define'"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import {computed, ref, watchEffect } from "vue"
import { useStore } from "vuex"
import type { Account, Currency, Member, Transfer } from "../../store/model"
import { useI18n } from "vue-i18n"
import CreateTransactionSingleForm from "./CreateTransactionSingleForm.vue"
import CreateTransactionSingleConfirm from "./CreateTransactionSingleConfirm.vue"
import type { DeepPartial } from "quasar"
import { useCreateTransferPayeeAccount, useCreateTransferPayerAccount } from "src/composables/fullAccount"

const props = defineProps<{
  /**
   * Group code
   */
  code: string,
  /**
   * Current member code.
   */
  memberCode?: string,
  /**
   * Whether the transfer is a payment or a request from the logged in account.
   */
  direction: "send" | "receive" | "transfer"
}>()

// Store
const store = useStore()
const { t } = useI18n()

const myAccount = computed<Account & {currency: Currency, member: Member}>(() => store.getters.myAccount)
const currency = computed<Currency>(() => myAccount.value.currency);


const text = computed(() => {
  switch (props.direction) {
    case "send":
      return t("sendPaymentText")
    case "receive":
      return t("receivePaymentText")
    default:
      return t("createTransactionText")
  }
})

const submitLabel = computed(() => {
  switch (props.direction) {
    case "send":
      return t("sendPayment")
    case "receive":
      return t("receivePayment")
    default:
      return t("submitTransaction")
  }
})

const selectPayer = computed(() => (props.direction !== "send"))
const selectPayee = computed(() => (props.direction !== "receive"))


const payerAccount = useCreateTransferPayerAccount(props.code, props.memberCode, props.direction)
const payeeAccount = useCreateTransferPayeeAccount(props.code, props.memberCode, props.direction)

// Transfer model
const transfer = ref<DeepPartial<Transfer>>()
const state = ref<"loading"|"define"|"confirm">("loading")

watchEffect(() => {
  if (state.value === "loading"
    && (selectPayer.value || payerAccount.value)
    && (selectPayee.value || payeeAccount.value)) {
    state.value = "define"
  }
})

const onFilled = (value: DeepPartial<Transfer>) => {
  transfer.value = value
  state.value = "confirm"
}

</script>