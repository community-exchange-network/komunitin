<template>
  <q-btn
    class="nav-button bg-background"
    padding="12px 18px"
    unelevated
    no-caps
  >
    <q-icon :name="icon" color="primary" size="20px" class="q-mr-sm" />
    <span class="text-weight-medium">{{ label }}</span>
    <span v-if="count !== undefined" class="text-caption text-weight-regular text-primary q-ml-sm">
      {{ count }}
    </span>
  </q-btn>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  icon: string
  count?: number
}>()
</script>

<style lang="scss" scoped>
.nav-button {
  color: $primary-container;
}
</style>
