<template>
  <simple-map
    :bounds="bounds"
    :interactive="true"
    style="height: 400px; width: 100% ; margin: 0; z-index:0;"
    :zoom="2"
    :center="center"
  >
    <simple-map-marker
      v-for="group in groups"
      :key="group.id"
      :coordinates="group.attributes.location.coordinates"
    >
      <l-popup :interactive="true" :permanent="false">
        <div>
          <div class="text-subtitle-2">{{ group.attributes.name }}</div>
          <div class="text-onsurface-m">{{  group.relationships.members?.meta.count ?? 0 }} {{ $t('members') }}</div>
          <div><a :href="`/groups/${group.attributes.code}`">Explore</a></div>
        </div>
      </l-popup>
    </simple-map-marker>
  </simple-map>
</template>
<script setup lang="ts">
import SimpleMap from "./SimpleMap.vue";
import SimpleMapMarker from "./SimpleMapMarker.vue";
import { LPopup } from "@vue-leaflet/vue-leaflet";
import { computed, } from "vue";
import type { Group } from "src/store/model";
import { getBoundsAroundPoints, getCenterOfBounds, type LngLat } from "src/composables/leaflet";

const props = defineProps<{
  groups?: Group[]
}>()

const coordinates = computed<LngLat[]>(() => props.groups?.map((group) => group.attributes.location.coordinates) ?? [])

// Compute the bounds of the map
const bounds = computed(() => getBoundsAroundPoints(coordinates.value))
const center = computed<LngLat>(() => getCenterOfBounds(bounds.value) ?? [0, 0])

</script>
