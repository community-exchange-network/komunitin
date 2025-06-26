<template>
  <div>
    <page-header 
      :title="$t('offer')" 
      :back="`/groups/${code}/offers`"
    >
      <template #buttons>
        <q-btn
          v-if="isMine"
          round
          flat
          icon="edit"
          :to="`/groups/${code}/offers/${offerCode}/edit`"
        />
        <delete-offer-btn 
          v-if="isMine"
          :code="code"
          :offer="offer"          
          :to="`/groups/${code}/offers`"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page
        v-if="!isLoading"
        class="q-pa-lg"
      >
        <offer-layout :num-images="offer.attributes.images.length">
          <template #member>
            <member-header
              :to="`/groups/${code}/members/${offer.member.attributes.code}`"
              :member="offer.member"
              class="q-pa-none"
            />
          </template>
          <template #category>
            <category-avatar
              type="offer"
              :category="offer.category"
              caption
            />
          </template>
          <template #images>
            <carousel
              :images="offer.attributes.images"
              thumbnails
              height="400px"
            />
          </template>
          <template #content>
            <div class="text-h4 q-pb-sm">
              {{ offer.attributes.name }}
            </div>
            <div class="text-h6 q-pb-sm">
              <span class="text-onsurface-m">{{ $t('price') }}</span>
              <span>&nbsp;</span>
              <span class="negative-amount">{{ price }}</span>
            </div>
            <div class="text-body2 text-onsurface-m q-pb-md">
              <span>{{ $t('updatedAt', {
                date: $formatDate(offer.attributes.updated)
              }) }}</span>
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="col text-body1 text-onsurface"
              v-html="md2html(offer.attributes.content)"
            />
            <!-- eslint-enable vue/no-v-html -->
            <div class="text-body2 text-onsurface-m q-pb-md">
              <span>{{ $t('expiresAt', {
                date: $formatDate(offer.attributes.expires)
              }) }}</span>
            </div>
            <div class="q-pb-lg row q-gutter-x-md justify-end">
              <share-button 
                flat
                color="primary"
                :label="$t('share')"
                :title="$t('checkThisOffer', {member: offer.member.attributes.name})"
                :text="offer.attributes.name"
              />
              <contact-button
                unelevated
                color="primary"
                :label="$t('contact')"
                :contacts="offer.member.contacts"
              /> 
            </div>
          </template>
          <template #map>
            <simple-map
              class="simple-map"
              :center="offer.member.attributes.location.coordinates"
              :marker="offer.member.attributes.location.coordinates"
            />
            <div class="text-onsurface-m">
              <q-icon name="place" />
              {{ offer.member.attributes.location.name }}
            </div>
          </template>
        </offer-layout>
        <slot 
          name="after" 
          :offer="offer" 
        />
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";

import md2html from "../../plugins/Md2html";

import OfferLayout from "../../layouts/OfferLayout.vue";
import PageHeader from "../../layouts/PageHeader.vue";

import Carousel from "../../components/Carousel.vue";
import CategoryAvatar from "../../components/CategoryAvatar.vue";
import ContactButton from "../../components/ContactButton.vue";
import DeleteOfferBtn from "../../components/DeleteOfferBtn.vue";
import MemberHeader from "../../components/MemberHeader.vue";
import ShareButton from "../../components/ShareButton.vue";
import SimpleMap from "../../components/SimpleMap.vue";

import { formatPrice } from "src/plugins/FormatCurrency";
import { useStore } from "vuex";

const props = defineProps<{
  code: string,
  offerCode: string
}>()

const store = useStore()

const ready = ref(false)
const offer = computed(() => {
  return store.getters["offers/current"]
})

const isLoading = computed(() => {
  return !(ready.value || offer.value && offer.value.category && offer.value.member 
    && offer.value.member.contacts && offer.value.member.group 
    && offer.value.member.group.currency)
})
const price = computed(() => {
  return formatPrice(offer.value.attributes.price, offer.value.member.group.currency)
})
const isMine = computed(() => {
  return offer.value && offer.value.member && offer.value.member.id == store.getters.myMember.id
})
const fetchData = async(offerCode: string) => {
  await store.dispatch("offers/load", {
    id: offerCode,
    group: props.code,
    include: "category,member,member.contacts,member.group,member.group.currency"
  });
  ready.value = true
}

watch(() => props.offerCode, fetchData, { immediate: true })
</script>
