<template>
  <q-field
    v-bind="fieldProps"
    :model-value="model"
    @update:model-value="model = $event ?? undefined"
  >
    <template #control>
      <div class="full-width">
        <l-map
          ref="map"
          :options="{zoomControl: true, dragging: true, attributionControl: false}"
          style="height: 200px; width: 100% ; margin: 0; z-index:0; cursor: crosshair; border-radius: 4px;"
          :zoom="props.zoom ?? defaultZoom"
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
                class="leaflet-control leaflet-bar bg-white q-pa-xs q-ma-sm"
                size="md"
                type="button"
                title="Set current location"
                icon="my_location"
                @click.stop="locate"
              />
            </div>
          </div>
        </l-map>
        <div class="text-onsurface-m text-body-2">
          {{ $t('lnglat', {lng: markerLatLng?.lng?.toFixed(4), lat: markerLatLng?.lat?.toFixed(4)}) }}
        </div>
      </div>
    </template>
  </q-field>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, useTemplateRef } from 'vue'
import { useStore } from 'vuex'
import { reactiveOmit } from '@vueuse/shared'
import type { QFieldProps } from 'quasar'

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
type Coordinates = [number, number]
type Props = Omit<QFieldProps, "modelValue" | "onUpdate:modelValue"> & {
  /**
   * Array of [longitude, latitude]
   */
  defaultLocation: Coordinates,
  /**
   * The zoom level of the map
   */
  zoom?: number,
}
const props = withDefaults(defineProps<Props>(), {
  borderless: true,
  stackLabel: true
})
const model = defineModel<Coordinates | undefined>({ required: true })
const fieldProps = reactiveOmit(props, "defaultLocation", "zoom")
const store = useStore()

const initialLocation = () => {
  if (model.value) {
    return model.value
  } else if (store.state.me.location) {
    return store.state.me.location
  } else {
    return props.defaultLocation
  }
}

const centerLatLng = initialLocation().slice().reverse() as PointExpression
const markerLatLng = computed({
  get: () => {
    return model.value ? {lng: Number(model.value[0]), lat: Number(model.value[1])} : undefined
  },
  set: (value) => {
    model.value = value ? [value.lng, value.lat] : undefined
  }
})

const {markerIcon, url, zoom: defaultZoom } = useLeafletSettings()

const map = useTemplateRef<InstanceType<typeof LMap>>("map")
const onMapClick = (e: LeafletMouseEvent|LocationEvent) => markerLatLng.value = e.latlng
const onReady = () => {
  map.value?.leafletObject?.on("click", onMapClick)
  map.value?.leafletObject?.on("locationfound", onMapClick)
}

onBeforeUnmount(()=> {
  map.value?.leafletObject?.off("click", onMapClick)
  map.value?.leafletObject?.off("locationfound", onMapClick)
})

const locate = () => {
  map.value?.leafletObject?.locate({setView: true, maxZoom: defaultZoom})
}
</script>
