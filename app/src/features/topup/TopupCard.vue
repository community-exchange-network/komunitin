<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-overline text-uppercase text-onsurface-d q-pl-md">
        {{ t("deposit") }}
      </div>
      <div class="row items-center justify-between q-pl-md">
        <span class="text-body2 text-onsurface-m">{{ t('topupDepositAmount') }}</span>
        <span class="text-h6 text-weight-medium text-onsurface">
          {{ (topup.attributes.depositAmount / 100).toLocaleString(locale, {
            style: 'currency',
            currency: topup.attributes.depositCurrency,
            currencyDisplay: 'symbol'
          }) }}
        </span>
      </div>
    </q-card-section>
    <q-separator />
    <q-card-section>
      <div class="text-overline text-uppercase text-onsurface-d q-pl-md">
        {{ t("receive") }}
      </div>
      <div class="row items-center justify-between">
        <account-header :account="account" />
        <span class="text-h6 text-weight-medium text-primary">
          {{ formatCurrency(topup.attributes.receiveAmount, account.currency) }}
        </span>
      </div>
    </q-card-section>
    <q-separator />
    <q-card-section>
      <div class="q-pl-md">
        <div class="row items-center justify-between">
          <span class="text-body2 text-onsurface-m text-weight-regular">{{ t('topupStatus') }}</span>
          <div>
            <q-chip
              :color="statusColor"
              text-color="white"
              size="md"
            >
              <q-spinner v-if="polling" size="16px" class="q-mr-sm" color="white"/>
              {{ statusLabel }}
            </q-chip>
          </div>
        </div>
        
        <div v-if="topup.attributes.paymentData" class="q-mt-lg">
          <a v-if="!showDetails" class="text-body2 text-onsurface-d" @click="showDetails = true" href="#">
            {{ t('topupShowPaymentDetails') }}
          </a>
          <div v-else-if="showDetails" class="q-gutter-y-sm">
            <div class="row items-center justify-between">
              <span class="text-body2 text-onsurface-d text-weight-light">{{ t('topupPaymentId') }}</span>
              <span class="text-body2 text-onsurface-m text-weight-regular">
                {{ topup.attributes.paymentData.paymentId }}
              </span>
            </div>
            <div class="row items-center justify-between">
              <span class="text-body2 text-onsurface-d text-weight-light">{{ t('topupPaymentStatus') }}</span>
              <span class="text-body2 text-onsurface-m text-weight-regular">
                {{ topup.attributes.paymentData.status }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>
<script setup lang="ts">
import { useLocale } from "../../boot/i18n";
import { type Topup} from "./model"
import { useI18n } from "vue-i18n"
import formatCurrency from '../../plugins/FormatCurrency';
import AccountHeader from "../../components/AccountHeader.vue";
import type { Account, Currency } from "../../store/model";
import { computed, ref } from "vue";

const props = defineProps<{
  topup: Topup,
  account: Account & { currency: Currency }
  polling?: boolean
}>()
const { t } = useI18n()
const locale = useLocale()

const statusLabel = computed(() => {
  switch (props.topup.attributes.status) {
    case "new":
      return t("topupStatusNew")
    case "pending":
      return t("topupStatusPending")
    case "payment_failed":
      return t("topupStatusPaymentFailed")
    case "payment_completed":
      return t("topupStatusPaymentCompleted")
    case "transfer_completed":
      return t("topupStatusTransferCompleted")
    case "transfer_failed":
      return t("topupStatusTransferFailed")
    case "canceled":
      return t("topupStatusCanceled")
    case "canceling":
      return t("topupStatusCanceling")
    default:
      return props.topup.attributes.status
  }
})

const statusColor = computed(() => {
  switch (props.topup.attributes.status) {
    case "transfer_completed":
      return "positive"
    case "transfer_failed":
    case "canceled":
      return "negative"
    default:
      return "warning"
  }
})

const showDetails = ref(false)


</script>