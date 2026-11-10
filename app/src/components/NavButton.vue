<template>
  <q-btn
    :class="active ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-primary'"
    class="overflow-hidden"
    :icon="icon"
    :padding="stack ? '12px 4px' : '12px 18px'"
    :stack="stack"
    unelevated
    no-caps
  >
    <span :class="stack ? 'q-mt-xs' : 'q-ml-sm'">
      <span class="text-label-large" :class="{ 'text-primary-variant': !active }">{{ label }}</span>
      <span v-if="count !== undefined" class="text-body-small q-ml-sm">
        {{ count }}
      </span>
    </span>
  </q-btn>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  icon: string
  count?: number
  active?: boolean
  stack?: boolean
}>()
</script>
