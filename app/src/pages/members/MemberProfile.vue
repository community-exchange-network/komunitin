<template>
  <div class="row text-onsurface-m">
    <!-- BIO -->
    <div class="column col-12 col-md-8">
      <div v-if="member.attributes.description">
        <div class="text-overline text-uppercase text-onsurface-d">
          {{ $t('bio') }}
        </div>
        <!-- eslint-disable vue/no-v-html -->
        <div 
          v-html="md2html(member.attributes.description)"
        />
        <!-- eslint-enable vue/no-v-html -->
      </div>
      <!-- LOCATION -->
      <div>
        <div class="text-overline text-uppercase text-onsurface-d">
          {{ $t('location') }}
        </div>
        <SimpleMap
          class="simple-map"
          :center="mapCenter"
          :marker="member.attributes.location?.coordinates"
        />
        <div v-if="member.attributes.address.addressLocality">
          <q-icon name="place" />{{ member.attributes.address.addressLocality }}
        </div>
      </div>
    </div>
    <!-- CONTACT -->
    <div class="col-12 col-md-4">
      <div class="text-overline text-uppercase text-onsurface-d q-pl-md">
        {{ $t('contact') }}
      </div>
      <SocialNetworkList
        type="contact"
        :contacts="member.attributes.contacts"
      />
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
