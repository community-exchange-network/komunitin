<template>
  <simple-map
    :bounds="bounds"
    :interactive="true"
    style="height: 400px; width: 100% ; margin: 0; z-index:0;"
    :zoom="2"
    :center="center"
  >
    <l-marker
      v-for="marker in groupMarkers"
      :key="marker.group.id"
      :lat-lng="marker.latLng"
    >
      <l-popup :interactive="true" :permanent="false">
        <div>
          <div class="text-subtitle-2">{{ marker.group.attributes.name }}</div>
          <div class="text-onsurface-m">{{  marker.group.relationships.members?.meta.count ?? 0 }} {{ $t('members') }}</div>
          <div><a :href="`/groups/${marker.group.attributes.code}`">Explore</a></div>
        </div>
      </l-popup>
    </l-marker>
  </simple-map>
</template>
<script setup lang="ts">
import SimpleMap from "./SimpleMap.vue";
import { LMarker, LPopup } from "@vue-leaflet/vue-leaflet";
import { computed, } from "vue";
import type { LatLngExpression } from "leaflet";
import type { Group } from "src/store/model";
import { getBoundsAroundPoints, getCenterOfBounds, toLeafletLatLng, type LngLat } from "src/composables/leaflet";

const props = defineProps<{
  groups?: Group[]
}>()

const coordinates = computed<LngLat[]>(() => props.groups?.map((group) => group.attributes.location.coordinates) ?? [])
const groupMarkers = computed<{ group: Group, latLng: LatLngExpression }[]>(() =>
  props.groups?.map((group) => ({
    group,
    latLng: toLeafletLatLng(group.attributes.location.coordinates),
  })) ?? []
)

// Compute the bounds of the map
const bounds = computed(() => getBoundsAroundPoints(coordinates.value))
const center = computed<LngLat>(() => getCenterOfBounds(bounds.value) ?? [0, 0])

</script>
