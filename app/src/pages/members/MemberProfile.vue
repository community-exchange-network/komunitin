<template>
  <div class="row text-onsurface q-col-gutter-md">
    <!-- BIO -->
    <div class="column col-12 col-md-8">
      <div class="bg-surface rounded-borders shadow-2 q-pa-md">
        <div v-if="member.attributes.description">
          <!-- eslint-disable vue/no-v-html -->
          <div 
            v-html="md2html(member.attributes.description)"
          />
          <!-- eslint-enable vue/no-v-html -->
        </div>
      </div>
    </div>
      <!-- LOCATION -->
      <div class="col-12 col-md-8 order-md-last">
        <q-card>
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
      <!-- CONTACT -->
      <div class="col-12 col-md-4">
        <social-network-list
          type="contact"
          :contacts="member.contacts"
        />
      </div>
    
  </div>
</template>
<script lang="ts">
import { defineComponent } from "vue"

import md2html from "../../plugins/Md2html";

import SimpleMap from "../../components/SimpleMap.vue";
import SocialNetworkList from "../../components/SocialNetworkList.vue"


export default defineComponent({
  name: "MemberProfile",
  components: {
    SimpleMap,
    SocialNetworkList
  },
  props: {
    member: {
      type: Object,
      required: true
    }
  },
  setup() {
    return {
      md2html
    }
  }
})
</script>