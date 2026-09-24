<template>
  <l-marker :lat-lng="props.latLng">
    <l-icon :icon-size="[26, 32]" :icon-anchor="[16, 32]" class-name="">
        <svg width="26" height="32" viewBox="0 0 24 28" class="fill-primary">
            <path d="M12 0C6 0 1 5 1 11c0 8 11 17 11 17s11-9 11-17c0-6-5-11-11-11z"></path>
            <circle cx="12" cy="11" r="4.2" fill="#fff"></circle>
        </svg>
    </l-icon>
    <slot />
  </l-marker>
</template>

<script setup lang="ts">
import { LMarker, LIcon } from '@vue-leaflet/vue-leaflet'
import { type LatLngExpression } from 'leaflet';

const props = defineProps<{
    latLng: LatLngExpression,
}>()

</script>
