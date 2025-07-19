<template>
  <div>
    <page-header
      :title="$t('transactions')" 
      search 
      balance
      @search="search" 
    />
    <q-page-container>
      <q-page>
        <transaction-items
          ref="transactionItems"
          :code="props.code"
          :member="myMember" 
        />
        <create-transaction-btn />
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "vuex";

import PageHeader from "../../layouts/PageHeader.vue";
import CreateTransactionBtn from "../../components/CreateTransactionBtn.vue";
import TransactionItems from "./TransactionItems.vue";

const props = defineProps<{
  code: string,
}>()
const store = useStore()
const myMember = computed(() => store.getters.myMember);
const transactionItems = ref<InstanceType<typeof TransactionItems>>()

const search = (query: string) => {
  transactionItems.value?.fetchResources(query);
}

</script>
