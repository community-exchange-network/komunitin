<template>
  <Error404
    v-if="error?.code === KErrorCode.NotFound"
    :to="`/groups/${code}/needs`"
  />
  <div v-else>
    <page-header 
      :title="title ?? $t('need')" 
      :back="`/groups/${code}/needs`"
    >
      <template #buttons>
        <q-btn
          v-if="need && canEdit"
          round
          flat
          icon="edit"
          :to="`/groups/${code}/needs/${needCode}/edit`"
          :title="$t('editNeed')"
        />
        <delete-need-btn 
          v-if="need && canEdit"
          :code="code"
          :need="need"          
          :to="`/groups/${code}/needs`"
          color="white"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page
        v-if="need && isReady"
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
              v-html="md2html(need.attributes.description)"
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
                :text="need.attributes.description"
              />
              <contact-button
                unelevated
                color="primary"
                :label="$t('contact')"
                :contacts="need.member.attributes.contacts"
              /> 
            </div>
          </template>
          <template #map>
            <simple-map
              class="simple-map"
              :center="need.member.attributes.location?.coordinates"
              :marker="need.member.attributes.location?.coordinates"
            />
            <div class="text-onsurface-m" v-if="need.member.attributes.location?.name">
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
<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";

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
import Error404 from "../Error404.vue";

import { useResource } from "src/composables/useResources";
import type { Need, Member, Category } from "../../store/model";
import { KErrorCode } from "src/KError";

type FullNeed = Need & { member: Member, category: Category }

const props = defineProps<{
  code: string
  needCode: string
  title?: string
}>()

const store = useStore()
const needOptions = computed(() => ({
  code: props.needCode,
  group: props.code,
  include: "category,member,member.account"
}))
const { resource: need, error } = useResource<FullNeed>('needs', needOptions)
const canEdit = computed(() =>
  need.value?.member?.id === store.getters.myMember?.id || store.getters.isAdmin
)
const isReady = computed(() => Boolean(need.value && need.value.member && need.value.category))
</script>
