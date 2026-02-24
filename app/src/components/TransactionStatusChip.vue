<template>
  <q-chip
    :color="color"
    text-color="white"
    :label="label"
  />
</template>
<script setup lang="ts">
import { useTransferStatus } from "../composables/transferStatus";
import type { TransferState } from "../store/model";

const props = defineProps<{
  status: TransferState;
}>();

const { color, label } = useTransferStatus(() => props.status);
</script>
