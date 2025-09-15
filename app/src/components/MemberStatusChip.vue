<template>
  <q-chip
    :color="color"
    text-color="white"
    :icon="icon"
    :label="label"
  />
</template>
<script setup lang="ts">
import { useAccountStatus } from '../composables/accountStatus';
import { MemberState } from '../store/model';


const props = defineProps<{
  status: MemberState
}>()

const { color, icon, label } = useAccountStatus(() => props.status)


</script>