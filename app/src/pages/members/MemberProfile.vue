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
        <simple-map
          class="simple-map"
          :center="member.attributes.location.coordinates"
          :marker="member.attributes.location.coordinates"
        />
        <div><q-icon name="sym_r_place" />{{ member.attributes.location.name }}</div>
      </div>
    </div>
    <!-- CONTACT -->
    <div class="col-12 col-md-4">
      <div class="text-overline text-uppercase text-onsurface-d q-pl-md">
        {{ $t('contact') }}
      </div>
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