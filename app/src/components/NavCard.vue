<template>
  <q-card
    flat
    class="transition-all bg-active text-onsurface-m q-hoverable cursor-pointer"
    tabindex="0"
  >
    <span class="q-focus-helper"></span>
    <q-card-section class="text-center">
      <q-icon
        :name="props.icon"
        size="sm"
      />
      <div class="text-body2 text-weight-medium">
        {{ props.label }}
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string, icon: string }>()
</script>
