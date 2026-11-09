<template>
  <q-btn
    :class="active ? 'bg-primary text-on-primary' : 'bg-page-background text-primary'"
    class="overflow-hidden"
    :icon="icon"
    :padding="stack ? '12px 4px' : '12px 18px'"
    :stack="stack"
    unelevated
    no-caps
  >
    <span :class="stack ? 'q-mt-xs' : 'q-ml-sm'">
      <span class="text-weight-medium" :class="{ 'text-primary-variant': !active }">{{ label }}</span>
      <span v-if="count !== undefined" class="text-caption q-ml-sm">
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
