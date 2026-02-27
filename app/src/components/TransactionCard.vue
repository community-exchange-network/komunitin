<template>
  <q-card 
    flat 
    bordered
  >
    <q-card-section 
      class="q-pb-lg"
      :class="[$q.screen.gt.xs ? 'q-px-lg' : '']"
    >
      <!-- main section -->
      <div class="text-overline text-uppercase text-onsurface-d">
        {{ $t("transaction") }}
      </div>
      <div class="text-body1 text-onsurface q-mt-sm text-weight-medium">
        {{ transfer.attributes.meta.description }}
      </div>
      <div
        class="text-h5 flex justify-between q-mt-xs"
        :class="positive ? 'positive-amount' : 'negative-amount'"
      >
        <span>{{ FormatCurrency(transfer.attributes.amount, myCurrency) }}</span>
        <span 
          v-if="otherCurrency && otherAmount" 
          class="text-h6 text-onsurface-m text-weight-regular"
        >
          {{ FormatCurrency(otherAmount, otherCurrency) }}
        </span>
      </div>
    </q-card-section>
    <q-card-section class="q-pt-sm q-pb-lg" :class="[$q.screen.gt.xs ? 'q-px-lg' : 'q-px-md']">
      <!-- dotted line connecting the two avatars -->
      <div class="relative-position">
        <div class="avatar-connector" />
        <!-- payer -->
        <div class="text-overline text-uppercase text-onsurface-d q-pl-xl q-ml-sm"  style="margin-bottom: -10px;">
          {{ $t("payer") }}
        </div>
        <transaction-card-account
          :account="transfer.payer"
          :address="transfer.attributes.meta.creditCommons?.payerAddress"
          :group="otherCurrency ? payerGroup : undefined"
        />
        <!-- payee -->
        <div class="text-overline text-uppercase text-onsurface-d q-pt-sm q-pl-xl q-ml-sm" style="margin-bottom: -10px;">
          {{ $t("payee") }}
        </div>
        <transaction-card-account
          v-if="transfer.payee"
          :account="transfer.payee"
          :address="transfer.attributes.meta.creditCommons?.payeeAddress"
          :group="otherCurrency ? payeeGroup : undefined"
        />
        </div>
    </q-card-section>
    <q-card-section class="row items-center justify-between q-pt-sm q-pb-lg" :class="[$q.screen.gt.xs ? 'q-px-lg' : 'q-px-md']">
      <span class="text-caption text-onsurface-m" style="font-size: 14px;">{{ capitalize($formatDate(transfer.attributes.updated)) }}</span>
      <pill-badge :color="statusColor" >{{ statusLabel }}</pill-badge>
    </q-card-section>
    <slot />
  </q-card>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";
import TransactionCardAccount from "./TransactionCardAccount.vue";
import PillBadge from "./PillBadge.vue";
import FormatCurrency, { convertCurrency } from "../plugins/FormatCurrency"
import type { Currency, ExtendedTransfer, Group } from "src/store/model";
import { useTransferStatus } from "src/composables/transferStatus";

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

const capitalize = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const { color: statusColor, label: statusLabel } = useTransferStatus(props.transfer.attributes.state)


</script>

<style scoped lang="scss">
.avatar-connector {
  position: absolute;
  left: 19px;
  top: 60px;
  bottom: 48px;
  border-left: 2px dotted rgba(0, 0, 0, 0.18);
  pointer-events: none;
}
</style>