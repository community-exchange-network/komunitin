<template>
  <q-item
    :to="transfer.id ? `/groups/${code}/transactions/${transfer.id}` : undefined"
    :clickable="!!transfer.id"
    class="q-py-md"
    :class="transfer.attributes.state"
  >
    <div :class="props.bothAccounts ? 'col-4 col-sm-3' : 'col col-sm-4'" class="flex">
      <account-item-content
        :account="firstAccount"
        :address="firstCreditCommonsAddress"
        :caption="overrideCaption"
      />
    </div>
    <div v-if="bothAccounts" class="col-4 col-sm-3 flex">
      <account-item-content
        :account="secondAccount"
        :address="secondCreditCommonsAddress"
      />
    </div>
    <q-item-section class="gt-xs col q-pl-md text-on-surface">
      <q-item-label lines="2">
        {{ description }}
      </q-item-label>
    </q-item-section>
    <q-item-section side top class="q-pr-none q-ml-auto">
      <div class="column items-end text-right">
        <q-item-label
          caption
          class="col"
        >
          <q-badge
            :color="statusColor"
            :text-color="statusTextColor"
            v-if="showTransferStatus"
            class="badge-square text-label-small"
            >
            {{ statusLabel }}
          </q-badge>
          <span v-else>
            {{ $formatDate(transfer.attributes.updated) }}
          </span>
        </q-item-label>
        <div
          class="col transaction-amount text-body-large-emphasized"
          :class="
            signedAmount >= 0
              ? 'text-amount-positive'
              : 'text-amount-negative'
          "
        >
          {{ FormatCurrency(signedAmount, currency) }}
        </div>
      </div>
    </q-item-section>
  </q-item>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { Account, Currency, ExtendedTransfer } from '@/store/model';
import FormatCurrency from "../plugins/FormatCurrency";
import AccountItemContent from "./AccountItemContent.vue";
import { useQuasar } from 'quasar';
import { useTransferStatus } from '../composables/transferStatus.ts';

const props = defineProps<{
  /**
   * The transfer to show
   */
  transfer: ExtendedTransfer,
  /**
   * The group code
   */
  code: string,
  /** Currency in which the transfer amount is expressed. */
  currency: Currency,
  /**
   * Whether to include both accounts in the transaction item.
   */
  bothAccounts?: boolean,
  /**
   * The subject account, if `bothAccounts` is not true.
   */
  account?: Account
  
}>()

const q = useQuasar()
const isPayerSubject = computed(() => {
  return props.transfer.relationships.payer.data.id === props.account?.id;
})

const signedAmount = computed<number>(() => {
  let amount = props.transfer.attributes.amount
  if (!props.bothAccounts && isPayerSubject.value) {
    amount = -amount
  }
  return amount
})

const firstAccount = computed<Account|undefined>(() => {
  if (props.bothAccounts) {
    return props.transfer.payer
  } else {
    return isPayerSubject.value 
      ? props.transfer.payee 
      : props.transfer.payer
  }
})

const firstCreditCommonsAddress = computed(() => {
  const creditCommons = props.transfer.attributes.meta.creditCommons
  if (props.bothAccounts) {
    return creditCommons?.payerAddress
  } else {
    return isPayerSubject.value 
      ? creditCommons?.payeeAddress 
      : creditCommons?.payerAddress
  }
})

const secondAccount = computed<Account|undefined>(() => {
  return props.bothAccounts ? props.transfer.payee : undefined
})
const secondCreditCommonsAddress = computed(() => {
  const creditCommons = props.transfer.attributes.meta.creditCommons
  return props.bothAccounts ? creditCommons?.payeeAddress : undefined
})


const description = computed(() => props.transfer.attributes.meta.description || "")
const overrideCaption = computed(() => {
  if (!props.bothAccounts && q.screen.lt.sm) {
    return description.value
  } else {
    return undefined
  }
})

const status = computed(() => props.transfer.attributes.state)
const {color: statusColor, label: statusLabel, textColor: statusTextColor } = useTransferStatus(status)
const showTransferStatus = computed(() => ["pending", "rejected", "failed"].includes(status.value))

</script>
<style lang="scss" scoped>
  /*
   * Set negative margin-top so the transaction amount so that it is 
   * inline with the transaction description and not too low.
   */
  .transaction-amount {
    margin-top: -6px;
  }
  .pending {
    background-color: $surface-container;
  }
  .rejected, .failed {
    background-color: $surface-container;
    .text-amount-positive, .text-amount-negative {
      color: $on-surface-low;
    }
  }
</style>
