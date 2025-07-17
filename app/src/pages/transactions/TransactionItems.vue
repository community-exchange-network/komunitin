<template>
  <resource-cards
    ref="resourceCards"
    v-slot="slotProps"
    :code="code"
    module-name="transfers"
    include="payer,payee,payee.currency"
    sort="-updated"
    :filter="filter"
    @page-loaded="fetchMembers"
  >
    <q-list
      v-if="slotProps.resources"
      padding
    >
      <div
        v-if="slotProps.resources.length > 0"
        class="row text-overline text-uppercase text-onsurface-m q-px-md"
      >
        <q-item-section avatar />
        <q-item-section>{{ props.bothAccounts ? $t("payer") : $t("account") }}</q-item-section>
        <q-item-section avatar style="margin-right:16px"/>
        <q-item-section class="">{{ $t("payee") }}</q-item-section>
        <q-item-section v-if="!q.screen.lt.sm" style="flex-grow: 20000;"/>
        <q-item-section side class="text-right q-ml-md" :style="{ width: !q.screen.lt.sm ? '200px' : '100px'}">{{ $t("amount") }}</q-item-section>
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
import { useQuasar } from "quasar";

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
}>()

const resourceCards = ref<typeof ResourceCards>()

const store = useStore()
const q = useQuasar()

const account = computed(() => props.member?.account);
const filter = computed(() => account.value ? { account: account.value.id } : undefined)

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
