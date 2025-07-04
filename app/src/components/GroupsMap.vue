<template>
  <simple-map
    :bounds="bounds"
    :interactive="true"
    style="height: 400px; width: 100% ; margin: 0; z-index:0;"
    :zoom="2"
    :center="center"
  >
    <l-marker
      v-for="group in groups"
      :key="group.id"
      :lat-lng="reverseCoordinates(group.attributes.location.coordinates)"
    >
      <l-popup :interactive="true" :permanent="false">
        <div>
          <div class="text-subtitle-2">{{ group.attributes.name }}</div>
          <div class="text-onsurface-m">{{  group.relationships.members?.meta.count ?? 0 }} {{ $t('members') }}</div>
          <div><a :href="`/groups/${group.attributes.code}`">Explore</a></div>
        </div>
      </l-popup>
    </l-marker>
  </simple-map>
</template>
<script setup lang="ts">
import SimpleMap from "./SimpleMap.vue";
import { LMarker, LPopup } from "@vue-leaflet/vue-leaflet";
import { computed, } from "vue";
import { Group } from "src/store/model";
import type { LatLngBounds } from "leaflet";
import { latLngBounds } from "leaflet/dist/leaflet-src.esm";

const props = defineProps<{
  groups?: Group[]
}>()

const reverseCoordinates = (coordinates: [number, number]): [number, number] => {
  return [coordinates[1], coordinates[0]]
}
const coordinates = computed(() => props.groups?.map((group) => reverseCoordinates(group.attributes.location.coordinates)) ?? [])

// Compute the bounds of the map
const bounds = computed<LatLngBounds>(() => latLngBounds(coordinates.value))
const center = computed<[number, number]>(() => {
  if (bounds.value.isValid()) {
    const center = bounds.value.getCenter()
    return [center.lat, center.lng]
  }
  return [0, 0]
})

</script>