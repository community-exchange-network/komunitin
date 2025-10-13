<template>
  <div class="q-pa-lg">
    <create-transaction-multiple-form 
      v-show="state === 'define'"
      :code="code"
      :direction="direction"
      :payer-account="payerAccount"
      :payee-account="payeeAccount"
      :select-payer="selectPayer"
      :select-payee="selectPayee"
      @update:model-value="onFilled"
    />
    <create-transaction-multiple-confirm 
      v-show="state === 'confirm'"
      :code="code"
      :rows="transferRows"
      :payer-account="payerAccount"
      :payee-account="payeeAccount"
      @back="state = 'define'"
    />
  </div>
</template>
<script setup lang="ts">
import CreateTransactionMultipleForm from './CreateTransactionMultipleForm.vue'
import CreateTransactionMultipleConfirm from './CreateTransactionMultipleConfirm.vue'
import type { ExtendedAccount } from 'src/store/model';
import { computed, ref } from 'vue';
import { useCreateTransferPayeeAccount, useCreateTransferPayerAccount } from 'src/composables/fullAccount';

export type TransferRow = {
  payer?: ExtendedAccount,
  payee?: ExtendedAccount,
  description?: string,
  amount?: number
}

const props = defineProps<{
  /**
   * Group code
   */
  code: string,
  /**
   * Payer member code. Mandatory if selectPayer is false.
   */
  memberCode?: string,
  /**
   * Whether the transfer is a payment or a request from the logged in account.
   */
  direction: "send" | "receive" | "transfer"
}>()

const selectPayer = computed(() => (props.direction !== "send"))
const selectPayee = computed(() => (props.direction !== "receive"))

const payerAccount = useCreateTransferPayerAccount(props.code, props.memberCode, props.direction)
const payeeAccount = useCreateTransferPayeeAccount(props.code, props.memberCode, props.direction)

const state = ref<"loading"|"define"|"confirm">("define")

const transferRows = ref<TransferRow[]>([])

const onFilled = (rows: TransferRow[]) => {
  transferRows.value = rows
  state.value = "confirm"
}

</script>
