<template>
  <transaction-list
    :code="props.code"
    header-balance
    :both-accounts="false"
  />
</template>
<script setup lang="ts">
import TransactionList from "./TransactionList.vue";

const props = defineProps<{
  code: string,
}>()
</script>