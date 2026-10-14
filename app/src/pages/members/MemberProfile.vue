<template>
  <div class="row text-onsurface q-col-gutter-md">
    <div class="col-md-8 col-12 column q-gutter-y-md">
      <!-- BIO -->
      <div
        v-if="member.attributes.description"
        class="bg-surface rounded-borders shadow-2 q-pa-md"
      >
        <!-- eslint-disable vue/no-v-html -->
        <div v-html="md2html(member.attributes.description)" />
        <!-- eslint-enable vue/no-v-html -->
      </div>
      <!-- LOCATION -->
      <q-card v-if="$q.screen.gt.sm">
        <simple-map
          class="simple-map"
          :center="mapCenter"
          :marker="member.attributes.location?.coordinates"
        />
        <q-card-section v-if="member.attributes.location?.name" class="text-onsurface-m">
          <q-icon name="place" />
          {{ member.attributes.location.name }}
        </q-card-section>
      </q-card>
    </div>
    <div class="col-12 col-md-4 column q-gutter-y-md">
      <!-- CONTACT -->
      <social-network-list
        type="contact"
        :contacts="member.attributes.contacts"
      />
      <!-- LOCATION -->
      <q-card v-if="!$q.screen.gt.sm">
        <simple-map
          class="simple-map"
          :center="mapCenter"
          :marker="member.attributes.location?.coordinates"
        />
        <q-card-section v-if="member.attributes.location?.name" class="text-onsurface-m">
          <q-icon name="place" />
          {{ member.attributes.location.name }}
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'

import SimpleMap from '../../components/SimpleMap.vue'
import SocialNetworkList from '../../components/SocialNetworkList.vue'
import md2html from '../../plugins/Md2html'
import type { Group, Member } from '../../store/model'

const props = defineProps<{
  member: Member & { group: Group }
}>()

const mapCenter = computed(() =>
  props.member.attributes.location?.coordinates ?? props.member.group.attributes.location?.coordinates
)
</script>
