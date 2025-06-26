<template>
  <div class="row justify-center">
    <div class="q-py-lg q-px-md col-12 col-sm-8 col-md-6">
      <div v-if="state === 'define'">
        <create-transaction-single-form
          :code="code"
          :select-payer="false"
          :select-payee="direction === 'transfer'"
          :payee-account="payeeAccount"
          :currency="myCurrency"
          :text="$t('enterTransactionDataNfc')"
          :submit-label="$t('scanNfc')"
          :model-value="editTransfer"
          @update:model-value="onFilled"
        />  
      </div>
      <div 
        v-if="state === 'scan' && editTransfer"
      >
        <div class="text-subtitle1 q-mb-lg">
          {{ $t('bringNfcTag') }}
        </div>
        <q-card 
          flat 
          bordered
        >
          <account-header
            class="q-pt-md"
            :account="editTransfer.payee"
          />
          <q-separator />
          <q-card-section class="text-center">
            <nfc-tag-scanner
              @detected="onDetected"
              @cancel="state = 'define'"
            />
          </q-card-section>
          <q-separator />
          <q-card-section class="text-center">
            <div class="text-h4 positive-amount">
              {{ FormatCurrency(editTransfer.attributes.amount, myCurrency) }}
            </div>
            <div class="text-body1">
              {{ editTransfer.attributes.meta.description }}
            </div>
          </q-card-section>
        </q-card>
        <div class="row justify-end q-mb-xl">
          <q-btn
            class="q-mt-md"
            color="primary"
            flat
            :label="$t('back')"
            @click="state = 'define'"
          />
        </div>
      </div>
      <div v-if="state === 'submit'">
        <create-transaction-single-confirm
          :code="code"
          :transfer="submitTransfer"
          auto-confirm
          @back="state = 'define'"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { transferAccountRelationships, useCreateTransferPayeeAccount } from 'src/composables/fullAccount';
import { Currency, ExtendedTransfer } from 'src/store/model';
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import FormatCurrency from 'src/plugins/FormatCurrency';
import CreateTransactionSingleForm from './CreateTransactionSingleForm.vue';
import CreateTransactionSingleConfirm from './CreateTransactionSingleConfirm.vue';
import AccountHeader from 'src/components/AccountHeader.vue';
import NfcTagScanner from 'src/components/NfcTagScanner.vue';
import KError, { KErrorCode } from 'src/KError';
import { useFullTransferByResource } from 'src/composables/fullTransfer';

const props = defineProps<{
  code: string,
  memberCode?: string,
  direction?: "receive" | "transfer"
}>()

const store = useStore()

const state = ref<"define" | "scan" | "submit">("define")

const myCurrency = computed<Currency>(() => store.getters.myAccount.currency)
const payeeAccount = useCreateTransferPayeeAccount(props.code, props.memberCode, props.direction ?? "receive")

const editTransfer = ref<ExtendedTransfer>()
const submitTransfer = ref<ExtendedTransfer>()

useFullTransferByResource(submitTransfer)

const onFilled = (value: ExtendedTransfer) => {
  editTransfer.value = value
  state.value = "scan"
}

const onDetected = async (tag: string) => {
  if (!editTransfer.value) {
    throw new KError(KErrorCode.ScriptError, "Transfer not defined")
  }
  // 1 - Get account
  await store.dispatch("accounts/loadList", {
    group: props.code,
    filter: {
      tag
    }
  })
  const list = store.getters["accounts/currentList"]
  if (list.length !== 1) {
    throw new KError(KErrorCode.NFCReadError, "No account found for this tag")
  }
  const payerAccount = list[0]
  // 2 - Create transfer
  const transfer = {
    type: "transfers",
    attributes: {
      amount: editTransfer.value.attributes.amount,
      meta: editTransfer.value.attributes.meta,
      state: "new",
      authorization: {
        type: "tag",
        value: tag
      },
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    },
    relationships: {
      ...transferAccountRelationships(payerAccount, editTransfer.value.payee, myCurrency.value),
      currency: { data: { id: myCurrency.value.id, type: "currencies" } }
    },
    payee: editTransfer.value.payee,
    payer: payerAccount
  }
  submitTransfer.value = transfer as ExtendedTransfer
  state.value = "submit"
}
</script>