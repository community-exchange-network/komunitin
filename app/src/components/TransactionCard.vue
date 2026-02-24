<template>
  <q-card 
    flat 
    bordered
    :class="[$q.screen.gt.sm ? 'q-px-xs' : '']"
  >
    <q-card-section >
      <!-- main section -->
      <div class="text-overline text-uppercase text-onsurface-d">
        {{ $t("transaction") }}
      </div>
      <div class="text-body1 q-my-sm text-onsurface">
        {{ transfer.attributes.meta.description }}
      </div>
      <div
        class="text-h5 flex justify-between"
        :class="positive ? 'positive-amount' : 'negative-amount'"
      >
        <span>{{ FormatCurrency(transfer.attributes.amount, myCurrency) }}</span>
        <span 
          v-if="otherCurrency && otherAmount" 
          class="text-h6 text-onsurface-m"
        >
          {{ FormatCurrency(otherAmount, otherCurrency) }}
        </span>
      </div>
    </q-card-section>
    <q-separator inset />
    <q-card-section>
      <!-- payer -->
      <div class="text-overline text-uppercase text-onsurface-d">
        {{ $t("payer") }}
      </div>
      <transaction-card-account
        :account="transfer.payer"
        :address="transfer.attributes.meta.creditCommons?.payerAddress"
        :group="otherCurrency ? payerGroup : undefined"
      />
      <!-- payee -->
      <div class="text-overline text-uppercase text-onsurface-d q-pt-md">
        {{ $t("payee") }}
      </div>
      <transaction-card-account
        v-if="transfer.payee"
        :account="transfer.payee"
        :address="transfer.attributes.meta.creditCommons?.payeeAddress"
        :group="otherCurrency ? payeeGroup : undefined"
      />
    </q-card-section>
    <q-separator v-if="!props.hideMeta" inset/>
    <q-card-section v-if="!props.hideMeta" class="row items-center justify-between">
      <span class="text-caption text-onsurface-m text-weight-medium" style="font-size: 14px;">{{ $formatDate(transfer.attributes.updated) }}</span>
      <transaction-status-badge :status="transfer.attributes.state" class="q-ma-none"/>
    </q-card-section>
    <slot />
  </q-card>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";
import TransactionStatusBadge from "./TransactionStatusBadge.vue"
import TransactionCardAccount from "./TransactionCardAccount.vue";
import FormatCurrency, { convertCurrency } from "../plugins/FormatCurrency"
import type { Currency, ExtendedTransfer, Group } from "src/store/model";

const props = defineProps<{
  transfer: ExtendedTransfer
  hideMeta?: boolean
}>()

// Store
const store = useStore()
const myAccount = store.getters.myAccount

// Note that when the current account is neither the payer nor the payee,
// the amount is considered as positive.
const positive = computed(() => {
  return props.transfer.payer.id != myAccount.id;
});

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