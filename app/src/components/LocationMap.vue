<template>
  <div>
    <simple-map
      class="rounded-borders overflow-hidden"
      :style="{ height: height ?? ($q.screen.gt.sm ? '250px' : '400px') }"
      :center="center"
      :marker="marker"
      :bounds="bounds"
    >
      <slot />
    </simple-map>
    <div v-if="name" class="text-caption text-on-surface-variant row items-center q-pt-sm">
      <q-icon name="place" size="16px" class="q-mr-xs" />
      {{ name }}
    </div>
  </div>
</template>
<script setup lang="ts">
import type { LngLat } from '@/composables/leaflet'
import SimpleMap from './SimpleMap.vue'

defineProps<{
  center?: LngLat
  marker?: LngLat
  bounds?: LngLat[]
  name?: string
  height?: string
}>()
</script>
