<template>
  <q-item
    :to="transfer.id ? `/groups/${code}/transactions/${transfer.id}` : undefined"
    :clickable="!!transfer.id"
    class="transaction-item"
    :class="transfer.attributes.state"
  >
    <account-item-content
      :account="firstAccount"
      :address="firstCreditCommonsAddress"
      :caption="overrideCaption"
    >
    </account-item-content>
    <account-item-content
      v-if="bothAccounts"
      :account="secondAccount"
      :address="secondCreditCommonsAddress"
    />
    <q-item-section 
      v-if="!q.screen.lt.sm" 
      class="section-extra"
    >
      <q-item-label lines="2">
        {{ description }}
      </q-item-label>
    </q-item-section>
    <q-item-section side>
      <div class="column items-end section-right">
        <q-item-label
          caption
          class="col top-right-label"
        >
          <span v-if="transfer.attributes.state == 'pending'">
            {{ $t("pending") }}
          </span>
          <span v-else-if="transfer.attributes.state == 'rejected'">
            {{ $t("rejected") }}
          </span>
          <span v-else-if="transfer.attributes.state == 'failed'">
            {{ $t("failed") }}
          </span>
          <span v-else>
            {{ $formatDate(transfer.attributes.updated) }}
          </span>
        </q-item-label>
        <div
          class="col transaction-amount text-h6"
          :class="
            signedAmount >= 0
              ? 'positive-amount'
              : 'negative-amount'
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
import { Account, Currency, ExtendedTransfer } from 'src/store/model';
import FormatCurrency from "../plugins/FormatCurrency";
import AccountItemContent from "./AccountItemContent.vue";
import { useQuasar } from 'quasar';
import { useStore } from 'vuex';

const props = defineProps<{
  /**
   * The transfer to show
   */
  transfer: ExtendedTransfer,
  /**
   * The group code
   */
  code: string,
  /**
   * Whether to include both accounts in the transaction item.
   */
  bothAccounts?: boolean,
  /**
   * The subject account, if `bothAccounts` is not true.
   */
  account?: Account & {currency: Currency}
  
}>()

const q = useQuasar()
const store = useStore()

const currency = computed(() => store.getters.myCurrency)

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


</script>
<style lang="scss" scoped>
  /*
   * Set negative margin-top so the transaction amount so that it is 
   * inline with the transaction description and not too low.
   */
  .transaction-amount {
    margin-top: -12px;
  }
  .pending {
    background-color: $light-error;
    .top-right-label{
      color: $error;
    }
  }
  .rejected, .failed {
    background: $light-background;
    .positive-amount, .negative-amount, .section-extra {
      color: $onsurface-d;
    }
  }
  @media (min-width: $breakpoint-sm-min) {
    .transaction-item {
      .section-extra{
        flex: 20000 1 0%;
      }
      .section-right {
        width: 200px;
      }
    }
  }
  @media (max-width: $breakpoint-xs-max) {
    .transaction-item {
      .section-right {
        width: 100px;
      }
    }
  }
  
  
</style>
