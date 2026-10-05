<template>
  <!-- Relative change of a stats value against the previous period. -->
  <div
    class="row inline no-wrap items-center text-body2 text-weight-semi-bold"
    :class="sign > 0 ? 'positive-amount' : 'negative-amount'"
  >
    <q-icon
      :name="sign > 0 ? 'trending_up' : 'trending_down'"
      size="18px"
      class="q-mr-xs"
    />
    {{ change }}
  </div>
</template>
<script setup lang="ts">
defineProps<{
  change: string
  sign: number
}>()
</script>
