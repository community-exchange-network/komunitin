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
          :center="member.attributes.location.coordinates"
          :marker="member.attributes.location.coordinates"
        />
        <q-card-section class="text-onsurface-m">
          <q-icon name="place" />
          {{ member.attributes.location.name }}
        </q-card-section>
      </q-card>
    </div>
    <div class="col-12 col-md-4 column q-gutter-y-md">
      <!-- CONTACT -->
      <social-network-list
        type="contact"
        :contacts="member.contacts"
      />
      <!-- LOCATION -->
      <q-card v-if="!$q.screen.gt.sm">
        <simple-map
          class="simple-map"
          :center="member.attributes.location.coordinates"
          :marker="member.attributes.location.coordinates"
        />
        <q-card-section class="text-onsurface-m">
          <q-icon name="place" />
          {{ member.attributes.location.name }}
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';

import md2html from '../../plugins/Md2html';

import SimpleMap from '../../components/SimpleMap.vue';
import SocialNetworkList from '../../components/SocialNetworkList.vue';

export default defineComponent({
  name: 'MemberProfile',
  components: {
    SimpleMap,
    SocialNetworkList,
  },
  props: {
    member: {
      type: Object,
      required: true,
    },
  },
  setup() {
    return {
      md2html,
    };
  },
});
</script>
