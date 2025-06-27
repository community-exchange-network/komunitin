<template>
  <div class="row justify-center">
    <div class="q-py-lg q-px-md col-12 col-sm-8 col-md-6">
      <div v-if="state === 'define'">
        <create-transaction-single-form
          :code="code"
          :select-payer="false"
          :select-payee="direction === 'transfer'"
          :payee-account="payeeAccount"
          :currency="currency"
          :text="$t('enterTransactionDataQR')"
          :submit-label="$t('showQRCode')"
          :model-value="transfer"
          @update:model-value="onFilled"
        />  
      </div>
      <div 
        v-if="state === 'show' && transfer"
      >
        <div class="text-subtitle1 q-mb-lg">
          {{ $t('scanThisQR') }}
        </div>
        <q-card 
          flat 
          bordered
        >
          <account-header
            class="q-pt-md"
            :account="transfer.payee"
          />
          <qr-code :data="qrData" />
          
          <q-card-section class="text-center q-pt-none">
            <div class="text-h4 positive-amount">
              {{ FormatCurrency(transfer.attributes.amount, currency) }}
            </div>
            <div class="text-body1">
              {{ transfer.attributes.meta.description }}
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
    </div>
  </div>
</template>
<script setup lang="ts">
import { Currency, ExtendedTransfer, Account } from "src/store/model";
import { computed, ref } from "vue"
import { useStore } from "vuex";
import CreateTransactionSingleForm from "./CreateTransactionSingleForm.vue";
import AccountHeader from "src/components/AccountHeader.vue";
import QrCode from "src/components/QrCode.vue";
import { useCreateTransferPayeeAccount } from "src/composables/fullAccount";
import FormatCurrency from "src/plugins/FormatCurrency";

const props = defineProps<{
  code: string,
  memberCode?: string,
  direction?: "receive" | "transfer"
}>()

const store = useStore()

const state = ref<"define" | "show">("define")

const currency = computed<Currency>(() => store.getters.myAccount.currency);

// This is used as a prop for the form, it will be defined for "receive" and undefined for "transfer"
const payeeAccount = useCreateTransferPayeeAccount(props.code, props.memberCode, props.direction ?? "receive")

const transfer = ref<ExtendedTransfer>()

const onFilled = (value: ExtendedTransfer) => {
  transfer.value = value
  state.value = "show"
}

const base = window?.location.origin ?? ""

// We should find a more robust way to get that url.
const getAcountAddressesUrl = (account: Account) => {
  // https:/..../:currencyCode/addresses/:id
  const currencyUrl = account.links.self.split('/').slice(0,-2).join('/')
  return `${currencyUrl}/cc/addresses/${account.id}`
} 

const qrData = computed(() => {
  const query = new URLSearchParams()
  query.set("c", getAcountAddressesUrl(transfer.value?.payee))
  query.set("a", transfer.value?.attributes.amount.toString() ?? "")
  query.set("m", transfer.value?.attributes.meta.description ?? "")
  return `${base}/pay?${query.toString()}`
})
</script>