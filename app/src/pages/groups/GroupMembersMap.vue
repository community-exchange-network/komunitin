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
      <simple-map-marker
        v-for="(memberMarker, i) of memberMarkers"
        :key="`member-${i}`"
        :coordinates="memberMarker"
      />
    </simple-map>
    <q-card-section class="group-footer-card text-onsurface-m">
      <q-icon name="place" />
      {{ group.attributes.location.name }}
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, watch } from "vue"
import { useStore } from "vuex"

import SimpleMap from "../../components/SimpleMap.vue"
import SimpleMapMarker from "../../components/SimpleMapMarker.vue"

import { useAllResources } from "src/composables/useResources"
import { getBoundsAroundCenter, isUsableLngLat, type LngLat } from "src/composables/leaflet"
import type { Group, Member } from "src/store/model"

const props = defineProps<{
  group: Group
}>()

const store = useStore()
const isLoggedIn = computed(() => store.getters.isLoggedIn)
const center = computed(() => props.group.attributes.location.coordinates)
const memberOptions = computed(() => ({ group: props.group.attributes.code, cache: 10 * 60 * 1000 }))
const { resources: members, loadAll } = useAllResources<Member>("members", memberOptions, { immediate: false })

watch([isLoggedIn, () => props.group.attributes.code], async ([loggedIn]) => {
  if (loggedIn) {
    await loadAll()
  }
}, { immediate: true })

const memberMarkers = computed<LngLat[]>(() => {
  if (!isLoggedIn.value) {
    return []
  }

  return (members.value ?? [])
    .flatMap((member: Member) => {
      const coordinates = member.attributes?.location?.coordinates
      return coordinates ? [coordinates] : []
    })
    .filter(isUsableLngLat)
})

const bounds = computed(() => getBoundsAroundCenter(center.value, memberMarkers.value, 0.8, 0.1))
</script>
