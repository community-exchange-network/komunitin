<template>
  <resource-cards
    ref="resourceCards"
    v-slot="slotProps"
    :code="code"
    module-name="transfers"
    include="payer,payee,payee.currency"
    sort="-updated"
    :filter="filter"
    :query="query"
    @page-loaded="fetchMembers"
  >
    <q-list
      v-if="slotProps.resources"
      padding
    >
      <div
        v-if="slotProps.resources.length > 0"
        class="row text-overline text-uppercase text-onsurface-d q-px-md q-pb-xs"
      >
        <div :class="props.bothAccounts ? 'col-4 col-sm-3' : 'col-grow col-sm-4'">{{ props.bothAccounts ? $t("payer") : $t("account") }}</div>
        <div v-if="bothAccounts" class="col-4 col-sm-3">{{ $t("payee") }}</div>
        <div class="gt-xs col-grow">{{ $t("description") }}</div>
        <div side class="q-ml-auto">{{ $t("amount") }}</div>
      </div>
      
      <template 
        v-for="transfer of loadedTransfers(slotProps.resources)"
        :key="transfer.id"
      >
        <q-separator />
        <transaction-item 
          :transfer="transfer"
          :code="code"
          :both-accounts="bothAccounts"
          :account="account"
          :clickable="false"
        />
      </template>
      <q-separator />
    </q-list>
  </resource-cards>
</template>
<script setup lang="ts">
import { computed, ref } from "vue"
import ResourceCards from "../ResourceCards.vue";
import TransactionItem from "src/components/TransactionItem.vue";
import { useStore } from "vuex";
import { ExtendedTransfer, Account, Currency } from "../../store/model";
import { LoadListPayload } from "src/store/resources";

const props = defineProps<{
  code: string,
  /**
   * Whether to include both accounts in the transaction item.
   */
  bothAccounts?: boolean,
  /**
   * The member whose transactions are being displayed (if bothAccounts is not true).
   */
  member?: { account: Account & { currency: Currency } }
  /**
   * The search query to filter transactions.
   */
  query?: string,
  /**
   * If provided, only transactions updated on or after this date are shown.
   */
  from?: Date | null,
  /**
   * If provided, only transactions updated before this date are shown.
   */
  to?: Date | null
}>()

const resourceCards = ref<typeof ResourceCards>()

const store = useStore()

const account = computed(() => props.member?.account);
const filter = computed(() => {
  return {
    ...(account.value ? { account: account.value.id } : {}),
    ...(props.from ? { "from": props.from.toISOString() } : {}),
    ...(props.to ? { "to": props.to.toISOString() } : {}),
  }
})

const transferLoaded = ref<Record<string, boolean>>({})

const fetchMembers = async (page: number) => {
  const transfers = store.getters["transfers/page"](page);
  const accountIds = new Set<string>();
  transfers
    .forEach((transfer: ExtendedTransfer) => {
      [transfer.payer.id, transfer.payee.id].forEach(id => {
        if (id !== account.value?.id) {
          accountIds.add(id);
        }
      })
    });
  await store.dispatch("members/loadList", {
    group: props.code,
    filter: {
      account: Array.from(accountIds).join(",")
    },
    onlyResources: true
  } as LoadListPayload);
  transfers.forEach((transfer: ExtendedTransfer) => {
    transferLoaded.value[transfer.id] = true
  });
}
/**
 * Filter the transfer list to those that are fully loaded.
 * 
 * Use this function instead of `transfer.payer.member !== null` since the latter 
 * is not reactive. Indeed, the link to associated resources are provided through 
 * lazy getters, so there are not "plain data" and hence can't be handled by the
 * reactive library. This function, instead, uses the plain dictionary this.transferLoaded
 * which does have the reactive properties.
 */
const loadedTransfers = (transfers: ExtendedTransfer[]): ExtendedTransfer[] => {
  return transfers.filter(transfer => transferLoaded.value[transfer.id] || (
    (transfer.payer?.member || transfer.relationships.payer.data.meta?.external && transfer.payer) 
    && 
    (transfer.payee?.member || transfer.relationships.payee.data.meta?.external && transfer.payee)
  ))
}

const fetchResources = (search: string): void => {
  resourceCards.value?.fetchResources(search);
}

defineExpose({
  fetchResources
})

</script>
