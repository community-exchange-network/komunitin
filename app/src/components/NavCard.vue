<template>
  <q-card
    class="transition-all bg-white text-onsurface-m q-hoverable cursor-pointer q-py-sm"
  >
    <span class="q-focus-helper"></span>
    <q-card-section class="text-center">
      <q-avatar 
        rounded 
        :color="props.iconColor" 
        :icon="props.icon"
        size="lg"
      />

      <div class="text-weight-medium text-onsurface q-mt-sm">
        {{ props.label }}
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string, icon: string, iconColor: string }>()
</script>
