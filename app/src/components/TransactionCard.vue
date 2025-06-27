<template>
  <q-card 
    flat 
    bordered
  >
    <q-card-section>
      <!-- payer -->
      <div class="text-overline text-uppercase text-onsurface-d q-pl-md">
        {{ $t("payer") }}
      </div>
      <account-header
        :account="transfer.payer"
      />
    </q-card-section>
    <q-separator />
    <q-card-section>
      <!-- payee -->
      <div class="text-overline text-uppercase text-onsurface-d q-pl-md">
        {{ $t("payee") }}
      </div>
      <account-header
        :account="transfer.payee"
        :address="transfer.attributes.meta.creditCommons?.payeeAddress"
      />
    </q-card-section>
    <q-separator />
    <q-card-section class="text-center">
      <!-- main section -->
      <div
        class="text-h4"
        :class="positive ? 'positive-amount' : 'negative-amount'"
      >
        {{ FormatCurrency((positive ? 1 : -1) * transfer.attributes.amount, myCurrency) }}
        <span 
          v-if="otherCurrency && otherAmount" 
          class="text-h5 text-onsurface-m"
        >
          ({{ FormatCurrency((positive ? 1 : -1) * otherAmount, otherCurrency) }})
        </span>
      </div>
      <div class="text-subtitle1 text-onsurface-m">
        {{ $formatDate(transfer.attributes.updated) }}
      </div>
      <div class="text-body1">
        {{ transfer.attributes.meta.description }}
      </div>
    </q-card-section>
    <q-separator />
    <q-card-section class="text-body2">
      <!-- details -->
      <div>
        <span class="text-onsurface-d">{{ $t("state") }}</span><span class="q-pl-sm">{{ state }}</span>
      </div>
      <div v-if="payerGroup">
        <span class="text-onsurface-d">{{ otherCurrency ? $t('payerGroup') : $t("group") }}</span><span class="q-pl-sm">{{ payerGroup.attributes.name }}</span>
      </div>
      <div v-if="otherCurrency">
        <span class="text-onsurface-d">{{ $t('payeeGroup') }}</span><span class="q-pl-sm">{{ payeeGroup.attributes.name }}</span>
      </div>
    </q-card-section>
    <slot />
  </q-card>
</template>
<script setup lang="ts">
import KError, { KErrorCode } from "src/KError";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useStore } from "vuex";
import AccountHeader from "./AccountHeader.vue"
import FormatCurrency, { convertCurrency } from "../plugins/FormatCurrency"
import { Currency, ExtendedTransfer, Group } from "src/store/model";

const props = defineProps<{
  transfer: ExtendedTransfer
}>()

// Store
const store = useStore()
const myAccount = store.getters.myAccount

// Note that when the current account is neither the payer nor the payee,
// the amount is considered as positive.
const positive = computed(() => {
  return props.transfer.payer.id != myAccount.id;
});

const { t } = useI18n()

const state = computed(() => {
  const state = props.transfer.attributes.state
  switch (state) {
    case "new":
      return t("new").toString();
    case "pending":
      return t("pending").toString();
    case "accepted":
      return t("accepted").toString();
    case "committed":
      return t("committed").toString();
    case "rejected":
      return t("rejected").toString();
    case "failed":
      return t("failed").toString();
    case "deleted":
      return t("deleted").toString();
  }
  throw new KError(KErrorCode.InvalidTransferState);
})

const payerGroup = computed(() => (props.transfer.payer.currency as Currency & {group: Group}).group)
const payeeGroup = computed(() => (props.transfer.payee?.currency as undefined | Currency & {group: Group})?.group)

const payerCurrency = computed(() => props.transfer.payer.currency)
const payeeCurrency = computed<Currency|undefined>(() => props.transfer.payee?.currency)

const myCurrency = computed(() => myAccount.currency)

const otherCurrency = computed(() => {
  if (myCurrency.value.id == payerCurrency.value.id) {
    return payeeCurrency.value?.id == myCurrency.value.id ? null : payeeCurrency.value;
  } else {
    // We're assuming that the user has the same currency as one of the two.
    return payerCurrency.value.id == myCurrency.value.id ? null : payerCurrency.value;
  }
})

const otherAmount = computed(() => {
  if (otherCurrency.value) {
    return convertCurrency(props.transfer.attributes.amount, myCurrency.value, otherCurrency.value);
  }
  return null;
})

</script>