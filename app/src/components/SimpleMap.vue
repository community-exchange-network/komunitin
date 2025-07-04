<template>
  <l-map
    :options="{ zoomControl: false, dragging: interactive, attributionControl: false, scrollWheelZoom: interactive }"
    style="height: 200px; width: 100% ; margin: 0; z-index:0;"
    :zoom="zoom ?? defaultZoom"
    :center="centerLatLng"
    :use-global-leaflet="false"
    :bounds="bounds"
  >
    <l-tile-layer :url="url" />
    <l-marker
      v-if="marker"
      :lat-lng="markerLatLng" 
      :icon="markerIcon"
    />
    <slot />
  </l-map>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { PointExpression, LatLngExpression, LatLngBounds} from "leaflet";
import "leaflet/dist/leaflet.css";
import { LMap, LTileLayer, LMarker } from "@vue-leaflet/vue-leaflet";
import { useLeafletSettings } from "../composables/leaflet";

const props = withDefaults(defineProps<{
  center: [number, number],
  zoom?: number
  bounds?: LatLngBounds,
  marker?: [number, number],
  interactive?: boolean
}>(), {
  interactive: true,
  marker: undefined
})

const { url, zoom: defaultZoom, markerIcon } = useLeafletSettings()
const centerLatLng = computed(() => props.center?.slice().reverse() as PointExpression)
const markerLatLng = computed(() => props.marker?.slice().reverse() as LatLngExpression)

</script>
