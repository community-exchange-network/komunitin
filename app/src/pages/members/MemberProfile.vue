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
      <div v-if="member.attributes.location">
        <div class="text-overline text-uppercase text-onsurface-d">
          {{ $t('location') }}
        </div>
        <SimpleMap
          class="simple-map"
          :center="member.attributes.location.coordinates"
          :marker="member.attributes.location.coordinates"
        />
        <div><q-icon name="place" />{{ member.attributes.location.name }}</div>
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
import SimpleMap from '../../components/SimpleMap.vue'
import SocialNetworkList from '../../components/SocialNetworkList.vue'
import md2html from '../../plugins/Md2html'
import type { Member } from '../../store/model'

defineProps<{
  member: Member
}>()
</script>
