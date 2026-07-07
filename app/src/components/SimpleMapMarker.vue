<template>
  <l-marker :lat-lng="latLng">
    <slot />
  </l-marker>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { LMarker } from "@vue-leaflet/vue-leaflet"
import type { LatLngExpression } from "leaflet"
import { toLeafletLatLng, type LngLat } from "../composables/leaflet"

const props = defineProps<{
  coordinates: LngLat
}>()

const latLng = computed<LatLngExpression>(() => toLeafletLatLng(props.coordinates))
</script>
