<template>
  <l-map
    ref="map"
    :options="{ zoomControl: false, dragging: interactive, attributionControl: false, scrollWheelZoom: interactive }"
    style="height: 200px; width: 100% ; margin: 0; z-index:0;"
    :zoom="zoom ?? defaultZoom"
    :center="centerLatLng"
    :use-global-leaflet="false"
    :bounds="leafletBounds"
    @ready="fitBounds"
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
import { computed, useTemplateRef } from "vue";

import type { LatLngExpression, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { LMap, LTileLayer, LMarker } from "@vue-leaflet/vue-leaflet";
import { toLeafletBounds, toLeafletLatLng, type LngLat, useLeafletSettings } from "../composables/leaflet";

const props = withDefaults(defineProps<{
  center: LngLat,
  zoom?: number
  // Points that need to remain visible, using the app-wide [longitude, latitude] convention.
  bounds?: LngLat[],
  marker?: LngLat,
  interactive?: boolean
}>(), {
  interactive: true,
  marker: undefined,
  zoom: undefined,
  bounds: undefined,
})

const { url, zoom: defaultZoom, markerIcon } = useLeafletSettings()
const centerLatLng = computed<LatLngExpression>(() => toLeafletLatLng(props.center))
const markerLatLng = computed<LatLngExpression | undefined>(() => props.marker ? toLeafletLatLng(props.marker) : undefined)
const leafletBounds = computed(() => toLeafletBounds(props.bounds))
const map = useTemplateRef<{ leafletObject?: LeafletMap }>("map")

const fitBounds = () => {
  if (!leafletBounds.value) {
    return
  }

  // LMap handles later bounds changes, but its watcher is installed after async Leaflet setup and is
  // not immediate. Fit the current prop on ready so already-loaded bounds are not missed.
  map.value?.leafletObject?.fitBounds(leafletBounds.value)
}

</script>
