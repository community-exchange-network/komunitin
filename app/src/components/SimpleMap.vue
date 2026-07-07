<template>
  <l-map
    ref="map"
    :options="{ zoomControl: false, dragging: interactive, attributionControl: false, scrollWheelZoom: interactive }"
    style="height: 200px; width: 100% ; margin: 0; z-index:0;"
    :zoom="zoom ?? defaultZoom"
    :center="centerLatLng"
    :use-global-leaflet="false"
    :bounds="bounds"
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
import { computed, toRaw, useTemplateRef } from "vue";

import type { PointExpression, LatLngExpression, LatLngBoundsExpression, Map as LeafletMap } from "leaflet";
import { latLngBounds } from "leaflet/dist/leaflet-src.esm";
import "leaflet/dist/leaflet.css";
import { LMap, LTileLayer, LMarker } from "@vue-leaflet/vue-leaflet";
import { useLeafletSettings } from "../composables/leaflet";

const props = withDefaults(defineProps<{
  center: [number, number],
  zoom?: number
  // Bounds accepts the points you need to keep visible. Note that this prop requires coordinates in
  // reversed order (lat, lng) compared to marker and center (lng, lat).
  bounds?: LatLngBoundsExpression,
  marker?: [number, number],
  interactive?: boolean
}>(), {
  interactive: true,
  marker: undefined,
  zoom: undefined,
  bounds: undefined,
})

const { url, zoom: defaultZoom, markerIcon } = useLeafletSettings()
const centerLatLng = computed(() => props.center?.slice().reverse() as PointExpression)
const markerLatLng = computed(() => props.marker?.slice().reverse() as LatLngExpression)
const map = useTemplateRef<{ leafletObject?: LeafletMap }>("map")

const fitBounds = () => {
  if (!props.bounds) {
    return
  }

  // LMap handles later bounds changes, but its watcher is installed after async Leaflet setup and is
  // not immediate. Fit the current prop on ready so already-loaded bounds are not missed.
  const bounds = latLngBounds(toRaw(props.bounds))
  if (bounds.isValid()) {
    map.value?.leafletObject?.fitBounds(bounds)
  }
}

</script>
