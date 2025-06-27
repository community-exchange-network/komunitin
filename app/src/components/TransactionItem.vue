<template>
  <account-header
    :account="otherAccount"
    :address="transfer.attributes.meta.creditCommons?.payeeAddress"
    :clickable="!!transfer.id"
    class="transaction-item"
    :class="transfer.attributes.state"
    :to="transfer.id ? `/groups/${code}/transactions/${transfer.id}` : null"
  >
    <template
      v-if="$q.screen.lt.md" 
      #caption
    >
      {{ description }}
    </template>
    <template 
      v-if="$q.screen.gt.sm" 
      #extra
    >
      <q-item-section class="section-extra">
        <q-item-label lines="2">
          {{ description }}
        </q-item-label>
      </q-item-section>
    </template>
    <template #side>
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
          {{ FormatCurrency(signedAmount, account.currency) }}
        </div>
      </div>
    </template>
  </account-header>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { Account, Currency, ExtendedTransfer } from 'src/store/model';
import FormatCurrency from "../plugins/FormatCurrency";
import AccountHeader from "./AccountHeader.vue";

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
   * The subject account
   */
  account: Account & {currency: Currency}
  
}>()

const signedAmount = computed<number>(() => {
  const amount = props.transfer.attributes.amount
  return (props.transfer.relationships.payer.data.id == props.account.id ? -1 : 1) * amount;
})

const otherAccount = computed<Account|undefined>(() => {
  const payer = props.transfer.payer
  const payee = props.transfer.payee
  // We can't directly compare object references because they're not the same.
  const other = props.account.id == props.transfer.relationships.payer.data.id ? payee : payer
  return other
})

const description = computed(() => props.transfer.attributes.meta.description || "")

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
  
</style>
