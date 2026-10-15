<template>
  <pill-badge :color="color" :icon="icon" >{{ label }}</pill-badge>
</template>
<script setup lang="ts">
import { useAccountStatus } from '../composables/accountStatus';
import type { MemberStatus } from '../store/model';
import PillBadge from './PillBadge.vue';


const props = defineProps<{
  status: MemberStatus
}>()

const { color, icon, label } = useAccountStatus(() => props.status)


</script>
