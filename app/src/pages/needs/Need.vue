<template>
  <div>
    <page-header 
      :title="title ?? $t('need')" 
      :back="`/groups/${code}/needs`"
    >
      <template #buttons>
        <q-btn
          v-if="canEdit"
          round
          flat
          icon="edit"
          :to="`/groups/${code}/needs/${needCode}/edit`"
          :title="$t('editNeed')"
        />
        <delete-need-btn 
          v-if="canEdit"
          :code="code"
          :need="need"          
          :to="`/groups/${code}/needs`"
          color="white"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page
        v-if="!isLoading"
        class="q-pa-lg"
      >
        <offer-layout :num-images="need.attributes.images.length">
          <template #member>
            <member-header
              :to="`/groups/${code}/members/${need.member.attributes.code}`"
              :member="need.member"
              class="q-pa-none"
            />
          </template>
          <template #category>
            <category-avatar
              type="need"
              :category="need.category"
              caption
            />
          </template>
          <template #images>
            <carousel
              :images="need.attributes.images"
              thumbnails
              height="400px"
            />
          </template>
          <template #content>
            <div class="text-body2 text-onsurface-m q-pb-md">
              <span>{{ $t('updatedAt', {
                date: $formatDate(need.attributes.updated)
              }) }}</span>
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <div 
              class="col text-body1 text-onsurface"
              v-html="md2html(need.attributes.content)"
            />
            <!-- eslint-enable vue/no-v-html -->
            <div class="text-body2 text-onsurface-m q-pb-md">
              <span>{{ $t('expiresAt', {
                date: $formatDate(need.attributes.expires)
              }) }}</span>
            </div>
            <div class="q-pb-lg row q-gutter-x-md justify-end">
              <share-button 
                flat
                color="primary"
                :label="$t('share')"
                :title="$t('checkThisNeed', {member: need.member.attributes.name})"
                :text="need.attributes.content"
              />
              <contact-button
                unelevated
                color="primary"
                :label="$t('contact')"
                :contacts="need.member.contacts"
              /> 
            </div>
          </template>
          <template #map>
            <simple-map
              class="simple-map"
              :center="need.member.attributes.location.coordinates"
              :marker="need.member.attributes.location.coordinates"
            />
            <div class="text-onsurface-m">
              <q-icon name="place" />
              {{ need.member.attributes.location.name }}
            </div>
          </template>
        </offer-layout>
        <slot 
          name="after" 
          :need="need" 
        />
      </q-page>
    </q-page-container>
  </div>
</template>
<script lang="ts">
import { defineComponent, ref } from "vue";

import md2html from "../../plugins/Md2html";

import OfferLayout from "../../layouts/OfferLayout.vue";
import PageHeader from "../../layouts/PageHeader.vue";

import Carousel from "../../components/Carousel.vue";
import CategoryAvatar from "../../components/CategoryAvatar.vue";
import ContactButton from "../../components/ContactButton.vue";
import MemberHeader from "../../components/MemberHeader.vue";
import ShareButton from "../../components/ShareButton.vue";
import SimpleMap from "../../components/SimpleMap.vue";
import DeleteNeedBtn from "../../components/DeleteNeedBtn.vue";

import type { Need, Member, Category, Contact } from "../../store/model";


export default defineComponent({
  components: {
    MemberHeader,
    SimpleMap,
    PageHeader,
    CategoryAvatar,
    ShareButton,
    ContactButton,
    Carousel,
    OfferLayout,
    DeleteNeedBtn
  },
  props: {
    code: {
      type: String,
      required: true,
    },
    needCode: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: false,
      default: null
    }
  },
  setup() {
    const ready = ref(false)
    return {
      md2html,
      ready
    }
  },
  computed: {
    need(): Need & {member: Member & {contacts: Contact[] }, category: Category } {
      return this.$store.getters["needs/current"]
    },
    isLoading(): boolean {
      // We need the explicit fetched boolean to force trigger update that may not
      // trigger due to the structure of relatinship links of resource objects.
      return !(this.need && this.need.member && this.need.member.contacts && this.need.category) && (this.ready || !this.ready)
    },
    canEdit(): boolean {
      return this.need?.member?.id === this.$store.getters.myMember.id || this.$store.getters.isAdmin
    }
    
  },
  created() {
    // See comment in analogous function at Group.vue.
    this.$watch("needCode", this.fetchData, { immediate: true });
  },
  methods: {
    async fetchData(needCode: string) {
      await this.$store.dispatch("needs/load", {
        id: needCode,
        group: this.code,
        include: "category,member,member.contacts,member.account"
      });
      this.ready = true
    }
  }
})
</script>