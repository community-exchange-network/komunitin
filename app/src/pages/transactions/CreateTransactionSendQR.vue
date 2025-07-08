<template>
  <div class="row justify-center">
    <div class="q-py-lg q-px-md col-12 col-sm-8 col-md-6">
      <div 
        v-if="state === 'scan'"
      >
        <div class="text-subtitle1 q-pb-lg"> 
          {{ $t('scanQRCode') }}
        </div>
        <qrcode-stream 
          class="qr-scanner q-mb-xl"
          @error="onError"
          @detect="onDetect" 
        />
        <div style="width: 100%; aspect-ratio: 2/1;" />
      </div>
      
      <create-transaction-single-confirm 
        v-if="state === 'confirm'"
        :code="code"
        :transfer="transfer"
        @back="state = 'scan'"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { Account, ExtendedAccount, ExtendedTransfer, TransferMeta } from "src/store/model"
import { computed, Ref, ref, watch } from "vue"
import { useStore } from "vuex"
import { transferAccountRelationships, useCreateTransferPayerAccount } from "src/composables/fullAccount"
import { QrcodeStream } from "vue-qrcode-reader"
import CreateTransactionSingleConfirm from "./CreateTransactionSingleConfirm.vue"
import KError, { KErrorCode } from "src/KError"
import { LoadByUrlPayload } from "src/store/resources"
import { loadExternalAccountRelationships, useFullTransferByResource } from "src/composables/fullTransfer"
import { useI18n } from "vue-i18n"
import { convertCurrency } from "src/plugins/FormatCurrency"

type DetectedCode = {
  format: "qr_code" | string,
  rawValue: string,
}

const props = defineProps<{
  code: string,
  memberCode?: string,
  qr?: string,
}>()

const store = useStore()
const myCurrency = computed(() => store.getters.myAccount.currency)

const state = ref<"scan" | "confirm">("scan")

const payerAccount = useCreateTransferPayerAccount(props.code, props.memberCode, "send") as Ref<Account>
const payeeAccount = ref<Account|undefined>()

const transfer = ref<ExtendedTransfer>()
useFullTransferByResource(transfer)

const errorMessage = ref<string>()
const { t } = useI18n()

const parsePaymentUrl = (paymentUrl: string) => {
  const url = new URL(paymentUrl)
  const addressesUrl = url.searchParams.get("c")
  const amount = url.searchParams.get("a")
  const description = url.searchParams.get("m")

  if (!addressesUrl || !amount) {
    throw new KError(KErrorCode.QRCodeError, "Invalid transfer URL")
  }

  return { addressesUrl, amount, description } 
}

const onPaymentUrl = async (paymentUrl: string) => {
  try {
    const {addressesUrl, amount, description} = parsePaymentUrl(paymentUrl)
    let localAmount = Number(amount)
    const meta = {
      description: description ?? "",
    } as TransferMeta

    const result = await fetch(addressesUrl)
    if (!result.ok) {
      throw new KError(KErrorCode.QRCodeError, "There has been an error fetching the payee account")
    }
    const addresses = await result.json()

    // TODO: Remove this !addresses.creditCommons to give preference to Komunitin addresses.
    if (!addresses.creditCommons && addresses.komunitin) {
      await store.dispatch("accounts/load", {
        url: addresses.komunitin,
      } as LoadByUrlPayload)
      
      payeeAccount.value = store.getters["accounts/current"]
      if (!payeeAccount.value) {
        throw new KError(KErrorCode.QRCodeError, "Payee account not found")
      }

      if (payeeAccount.value.relationships.currency.data.id !== myCurrency.value.id) {
        // Payee is external. Load currency.
        // Note that the useFullTransferByResource already calls this function so probably there's a more 
        // elegant way to accomplish the same with just one call.
        await loadExternalAccountRelationships(payeeAccount.value, store)
        localAmount = convertCurrency(localAmount, (payeeAccount.value as ExtendedAccount).currency, myCurrency.value)
      }
    } else if (addresses.creditCommons) {
      payeeAccount.value = undefined
      // TODO: Quote the currency conversion rate. Assuming it is 1 to 1.
      meta.creditCommons = {
        payeeAddress: addresses.creditCommons
      }
    }
    
    const resource = {
      type: "transfers",
      attributes: {
        amount: localAmount,
        meta,
        state: "new",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      relationships: transferAccountRelationships(payerAccount.value, payeeAccount.value, myCurrency.value),
      payer: payerAccount.value,
      payee: payeeAccount.value,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    transfer.value = resource
    state.value = "confirm"
    
  } catch (error) {
    errorMessage.value = t('qrInvalidError')
    if (error instanceof KError) {
      throw new KError(KErrorCode.QRCodeError, error.message, error)  
    } else {
      throw new KError(KErrorCode.QRCodeError, "Error parsing QR code", error)
    }
  }
}

const onDetect = async (detectedCodes: DetectedCode[]) => {
  if (detectedCodes.length > 0) {
    await onPaymentUrl(detectedCodes[0].rawValue)
  }
}

const onError = (error: Error) => {
  if (error.name === 'NotAllowedError') {
    // user denied camera access permission
    errorMessage.value = t('ErrorCamNotAllowed')
    throw new KError(KErrorCode.QRCodeError, errorMessage.value)
  } else if (error.name === 'NotFoundError') {
    // no suitable camera device installed
    errorMessage.value = t('ErrorCamNotFound')
    throw new KError(KErrorCode.QRCodeError, errorMessage.value)
  } else if (error.name === 'NotReadableError') {
    // maybe camera is already in use
    errorMessage.value = t('ErrorCamNotReadable')
    throw new KError(KErrorCode.QRCodeError, errorMessage.value)
  } else {
    // did you request the front camera although there is none?
    // browser seems to be lacking features
    // page is not served over HTTPS (or localhost)
    errorMessage.value = t('ErrorCamUnknown')
    throw new KError(KErrorCode.QRCodeError, errorMessage.value)
  }
}

// Redirection from payment Pay.vue. 
watch(() => props.qr, async () => {
  if (props.qr) {
    await onPaymentUrl(props.qr)
  }
}, {immediate: true})

</script>
<style scoped lang="scss">
  .qr-scanner {
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
  }
</style>