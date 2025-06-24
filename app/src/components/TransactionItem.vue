<template>
  <account-header
    :account="otherAccount(transfer)"
    :clickable="!!transfer.id"
    class="transaction-item"
    :class="transfer.attributes.state"
    :to="transfer.id ? `/groups/${code}/transactions/${transfer.id}` : null"
  >
    <template
      v-if="$q.screen.lt.md" 
      #caption
    >
      {{ transfer.attributes.meta.description }}
    </template>
    <template 
      v-if="$q.screen.gt.sm" 
      #extra
    >
      <q-item-section class="section-extra">
        <q-item-label lines="2">
          {{ transfer.attributes.meta.description }}
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
            signedAmount(transfer) >= 0
              ? 'positive-amount'
              : 'negative-amount'
          "
        >
          {{ FormatCurrency(signedAmount(transfer), account.currency) }}
        </div>
      </div>
    </template>
  </account-header>
</template>
<script setup lang="ts">
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

const signedAmount = (transfer: ExtendedTransfer): number => {
  const amount = transfer.attributes.amount
  return (transfer.relationships.payer.data.id == props.account.id ? -1 : 1) * amount;
}

const otherAccount = (transfer: ExtendedTransfer): Account => {
  const payer = transfer.payer
  const payee = transfer.payee
  // We can't directly compare object references because they're not the same.
  const other = props.account.id == transfer.relationships.payer.data.id ? payee : payer
  return other
}

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
