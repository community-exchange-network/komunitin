<template>
  <div class="badge text-white" :class="`bg-${color}`">{{ label }}</div>
</template>
<script setup lang="ts">
import { useTransferStatus } from "../composables/transferStatus";
import type { TransferState } from "../store/model";

const props = defineProps<{
  status: TransferState;
}>();

const { color, label } = useTransferStatus(() => props.status);
</script>
<style lang="scss" scoped>
.badge {
  font-size: 14px;
  padding: 4px 12px;
  border-radius: 16px;
}

</style>