<template>
  <transaction-list
    :code="props.code"
    :header-balance="false"
    both-accounts
  />
</template>
<script lang="ts" setup>
import TransactionList from "../transactions/TransactionList.vue";

const props = defineProps<{
  code: string,
}>()

</script>