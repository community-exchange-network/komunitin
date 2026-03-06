<template>
  <l-map
    ref="map"
    :options="{zoomControl: true, dragging: true, attributionControl: false}"
    style="height: 200px; width: 100% ; margin: 0; z-index:0; cursor: crosshair; border-radius: 4px;"
    :zoom="zoom ?? defaultZoom"
    :center="centerLatLng"
    :use-global-leaflet="false"
    @ready="onReady"
  >
    <l-tile-layer :url="url" />
    <l-marker
      v-if="markerLatLng"
      draggable
      :icon="markerIcon" 
      :lat-lng="markerLatLng"
      @update:lat-lng="(value) => markerLatLng = value"
    />
    <div class="leaflet-control-container">
      <div class="leaflet-bottom leaflet-right">
        <q-btn 
          class="leaflet-control leaflet-bar 
          bg-white q-pa-xs q-ma-sm"
          size="md"
          type="button"
          title="Set current location"
          icon="sym_r_my_location"
          @click.stop="locate"
        />
      </div>
    </div>
  </l-map>
  <div class="text-onsurface-m text-body-2">
    {{ $t('lnglat', {lng: markerLatLng?.lng?.toFixed(4), lat: markerLatLng?.lat?.toFixed(4)}) }}
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useStore } from 'vuex'

import type { LeafletMouseEvent, LocationEvent, PointExpression } from 'leaflet'
import "leaflet/dist/leaflet.css";
import { LMap, LMarker, LTileLayer } from '@vue-leaflet/vue-leaflet'
import { useLeafletSettings } from '../composables/leaflet'




/**
 * Location Selector compoenent based on Leaflet maps.
 * 
 * Use
 *  - Click a place on the map to select a location.
 *  - Drag the marker to change the location.
 *  - Drag and drop the map to pan
 *  - Use the +/- buttons or the mouse wheel to zoom in and out.
 *  - Use the "o" button to set your current location.
 * 
 * Starting point
 *  - The map is centered on the location provided by the modelValue prop.
 *  - If no modelValue is provided, the map is centered on the user's current location.
 *  - If the user's current location is not available, the map is centered on the default location.
 */
const props = defineProps<{
  /**
   * Array of [longitude, latitude]
   */
  modelValue: [number, number] | undefined,
  /**
   * Array of [longitude, latitude]
   */
  defaultLocation: [number, number],
  /**
   * The zoom level of the map
   */
  zoom?: number,
}>()
const emit = defineEmits<{
  /**
   * Emitted when the user selects a location
   * @param value The location selected by the user as an array of [longitude, latitude]
   */
  (e: 'update:modelValue', value: [number, number] | undefined): void
}>()
const store = useStore()

const initialLocation = () => {
  if (props.modelValue) {
    return props.modelValue
  } else if (store.state.me.location) {
    return store.state.me.location
  } else {
    return props.defaultLocation
  }
}

const centerLatLng = initialLocation().slice().reverse() as PointExpression
const markerLatLng = computed({
  get: () => {
    return props.modelValue ? {lng: Number(props.modelValue[0]), lat: Number(props.modelValue[1])} : undefined
  },
  set: (value) => {
    emit('update:modelValue', value ? [value.lng, value.lat] : undefined)
  }
})

const {markerIcon, url, zoom: defaultZoom } = useLeafletSettings()

const map = ref()
const onMapClick = (e: LeafletMouseEvent|LocationEvent) => markerLatLng.value = e.latlng
const onReady = () => {
  map.value.leafletObject.on("click", onMapClick)
  map.value.leafletObject.on("locationfound", onMapClick)
}

onBeforeUnmount(()=> {
  map.value.leafletObject?.off("click", onMapClick)
  map.value.leafletObject?.off("locationfound", onMapClick)
})

const locate = () => {
  map.value.leafletObject.locate({setView: true, maxZoom: defaultZoom})
}


</script>