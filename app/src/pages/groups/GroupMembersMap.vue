<template>
  <q-card
    square
    flat
  >
    <simple-map
      class="simple-map"
      :center="center"
      :marker="center"
      :bounds="bounds"
    >
      <l-marker
        v-for="(memberMarker, i) of memberMarkerLatLngs"
        :key="`member-${i}`"
        :lat-lng="memberMarker"
      />
    </simple-map>
    <q-card-section
      v-if="group.attributes.location?.name"
      class="group-footer-card text-onsurface-m"
    >
      <q-icon name="place" />
      {{ group.attributes.location.name }}
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, watch } from "vue"
import { useStore } from "vuex"
import type { LatLngExpression } from "leaflet"
import { LMarker } from "@vue-leaflet/vue-leaflet"

import SimpleMap from "../../components/SimpleMap.vue"

import { useAllResources } from "@/composables/useResources"
import { getBoundsAroundCenter, getBoundsAroundPoints, isUsableLngLat, toLeafletLatLng, type LngLat } from "@/composables/leaflet"
import type { Group, Member } from "@/store/model"

const props = defineProps<{
  group: Group
}>()

const store = useStore()
const own = computed(() => props.group.id === store.getters.myMember?.group.id)
const center = computed(() => props.group.attributes.location?.coordinates)
const memberOptions = computed(() => ({ group: props.group.attributes.code, cache: 10 * 60 * 1000 }))
const { resources: members, loadAll } = useAllResources<Member>("members", memberOptions, { immediate: false, watch: false })

watch([own, () => props.group.attributes.code], async ([isOwnGroup]) => {
  if (isOwnGroup) {
    await loadAll()
  }
}, { immediate: true })

const memberMarkers = computed<LngLat[]>(() => {
  if (!own.value) {
    return []
  }

  return (members.value ?? [])
    .flatMap((member: Member) => {
      const coordinates = member.attributes?.location?.coordinates
      return coordinates ? [coordinates] : []
    })
    .filter(isUsableLngLat)
})

const bounds = computed(() => center.value
  ? getBoundsAroundCenter(center.value, memberMarkers.value, 0.8, 0.1)
  : getBoundsAroundPoints(memberMarkers.value)
)
const memberMarkerLatLngs = computed<LatLngExpression[]>(() => memberMarkers.value.map(toLeafletLatLng))
</script>
