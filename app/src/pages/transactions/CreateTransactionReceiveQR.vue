<template>
  <div class="row justify-center q-pa-md">
    <div class="col-12 col-sm-8 col-lg-6">
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
        class="q-mb-xl"
      >
        <q-card>
          <q-card-section class="row no-wrap items-center bg-light text-body2 text-onsurface-m">
            <q-icon
              name="qr_code_scanner"
              size="sm"
              color="primary"
            />
            <span class="q-ml-sm">{{ $t('scanThisQR') }}</span>
          </q-card-section>
          <account-header
            class="q-pt-md"
            :account="transfer.payee"
          />
          <qr-code :data="qrData" />

          <q-card-section class="text-center q-pt-none q-pb-lg">
            <div class="text-h4 text-weight-bold positive-amount">
              {{ FormatCurrency(transfer.attributes.amount, currency) }}
            </div>
            <div class="text-body1 text-weight-medium text-onsurface q-mt-xs">
              {{ transfer.attributes.meta.description }}
            </div>
          </q-card-section>
          <q-separator inset />
          <q-card-actions class="justify-end q-pa-md">
            <q-btn
              color="primary"
              flat
              padding="xs lg"
              :label="$t('back')"
              @click="state = 'define'"
            />
          </q-card-actions>
        </q-card>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { Currency, ExtendedTransfer, Account } from "@/store/model";
import { computed, ref } from "vue"
import { useStore } from "vuex";
import CreateTransactionSingleForm from "./CreateTransactionSingleForm.vue";
import AccountHeader from "@/components/AccountHeader.vue";
import QrCode from "@/components/QrCode.vue";
import { useCreateTransferPayeeAccount } from "@/composables/fullAccount";
import FormatCurrency from "@/plugins/FormatCurrency";

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
const getAccountAddressesUrl = (account: Account) => {
  // https:/..../:currencyCode/addresses/:id
  const currencyUrl = account.links.self.split('/').slice(0,-2).join('/')
  return `${currencyUrl}/cc/addresses/${account.id}`
} 

const qrData = computed(() => {
  const query = new URLSearchParams()
  query.set("c", getAccountAddressesUrl(transfer.value?.payee))
  query.set("a", transfer.value?.attributes.amount.toString() ?? "")
  query.set("m", transfer.value?.attributes.meta.description ?? "")
  return `${base}/pay?${query.toString()}`
})
</script>