<template>
  <page-header
    :title="$t('transactions')"
    search
    @search="search" 
  />
  <q-page-container>
    <q-page>
      <transaction-items
        ref="transactionItems"
        :code="props.code"
        both-accounts
      />
    </q-page>
  </q-page-container>
</template>
<script lang="ts" setup>
import { defineProps, ref } from "vue"
import PageHeader from "../../layouts/PageHeader.vue"
import TransactionItems from "../transactions/TransactionItems.vue"

const props = defineProps<{
  code: string,
}>()

const transactionItems = ref<InstanceType<typeof TransactionItems>>()

const search = (query: string) => {
  transactionItems.value?.fetchResources(query);
}

</script>