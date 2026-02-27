<template>
  <pill-badge :color="color" :icon="icon" >{{ label }}</pill-badge>
</template>
<script setup lang="ts">
import { useAccountStatus } from '../composables/accountStatus';
import type { MemberState } from '../store/model';
import PillBadge from './PillBadge.vue';


const props = defineProps<{
  status: MemberState
}>()

const { color, icon, label } = useAccountStatus(() => props.status)


</script>