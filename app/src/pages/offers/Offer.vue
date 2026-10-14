<template>
  <Error404
    v-if="error?.code === KErrorCode.NotFound"
    :to="`/groups/${code}/offers`"
  />
  <div v-else>
    <page-header 
      :title="$t('offer')" 
      :back="`/groups/${code}/offers`"
    >
      <template #buttons>
        <q-btn
          v-if="offer && canEdit"
          round
          flat
          icon="edit"
          :to="`/groups/${code}/offers/${offerCode}/edit`"
          :title="$t('editOffer')"
        />
        <delete-offer-btn 
          v-if="offer && canEdit"
          :code="code"
          :offer="offer"          
          :to="`/groups/${code}/offers`"
          color="onsurface-m"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page
        v-if="offer && isReady"
        class="q-pa-md"
        style="padding-bottom:100px;"
      >
        <offer-layout :num-images="offer.attributes.images.length">
          <template #member>
            <member-header
              :to="`/groups/${code}/members/${offer.member.attributes.code}`"
              :member="offer.member"
              class="bg-surface rounded-borders shadow-2 q-pa-md"
            >
            <template #side>
              <q-icon
                name="chevron_right"
              />
            </template>
          </member-header>
          </template>
          <template #category>
              <!-- Ensure the category pill isn't positioned on top of thumbnails, if they exist -->
              <category-pill
                :style="offer.attributes.images.length > 1 && $q.screen.gt.sm ? `transform: translateY(-${72 * Math.ceil(offer.attributes.images.length / 4)}px);` : ''"
                type="offer"
                :category="offer.category"
              />
          </template>
          <template #images>
            <carousel
                :images="offer.attributes.images"
                thumbnails
                height="300px"
              />
          </template>
          <template #content>
            <div class="bg-surface rounded-borders shadow-2 q-pa-md q-mb-md">
              <div class="text-h4 text-bold text-serif q-mb-xs">
                {{ offer.attributes.title }}
              </div>
              <div class="row justify-between items-end text-caption text-muted q-pb-sm"
                style="line-height: 1.7rem;"
              >
                <div>
                  <span>{{ $t('price') }}</span>
                  <span>&nbsp;</span>
                  <span class="text-h5 text-bold positive-amount">{{ price }}</span>
                </div>
                <span>{{ $t('updatedAt', {
                  date: $formatDate(offer.attributes.updated)
                }) }}</span>
              </div>
              <q-separator v-if="offer.attributes.expires" class="q-mb-sm"/>
              <div v-if="offer.attributes.expires" class="text-caption text-muted row items-center">
                <q-icon name="schedule" class="q-mr-xs"/>
                 <span>{{ $t('expiresAt', { date: '' }) }}</span>
                 <q-chip color="accent-muted" text-color="muted">{{ $formatDate(offer.attributes.expires) }}</q-chip>
              </div>
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="col text-body1 text-onsurface bg-surface rounded-borders shadow-2 q-pa-md"
              v-html="md2html(offer.attributes.description)"
            />
          </template>
          <template #map>
            <q-card>
              <simple-map
                class="simple-map"
                :center="offer.member.attributes.location?.coordinates"
                :marker="offer.member.attributes.location?.coordinates"
              />
              <q-card-section v-if="offer.member.attributes.location?.name" class="text-onsurface-m">
                <q-icon name="place" />
                {{ offer.member.attributes.location.name }}
              </q-card-section>
            </q-card>
          </template>
        </offer-layout>
        <q-page-sticky expand position="bottom" class="shadow-2">
          <q-toolbar class="bg-light full-width justify-center q-gutter-x-md">
            <share-button 
              outline
              color="primary"
              :label="$t('share')"
              :title="$t('checkThisOffer', {member: offer.member.attributes.name})"
              :text="`${offer.attributes.title}\n${offer.attributes.description}`"
              />
              <contact-button
              unelevated
              color="primary"
              :label="$t('contact')"
              :contacts="offer.member.attributes.contacts"
            /> 
          </q-toolbar>
        </q-page-sticky>
        <slot 
          name="after" 
          :offer="offer" 
        />
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";

import md2html from "../../plugins/Md2html";

import OfferLayout from "../../layouts/OfferLayout.vue";
import PageHeader from "../../layouts/PageHeader.vue";

import Carousel from "../../components/Carousel.vue";
import CategoryPill from "../../components/CategoryPill.vue";
import ContactButton from "../../components/ContactButton.vue";
import DeleteOfferBtn from "../../components/DeleteOfferBtn.vue";
import MemberHeader from "../../components/MemberHeader.vue";
import ShareButton from "../../components/ShareButton.vue";
import SimpleMap from "../../components/SimpleMap.vue";
import Error404 from "../Error404.vue";

import { formatPrice } from "@/plugins/FormatCurrency";
import { useStore } from "vuex";
import { useResource } from "@/composables/useResources";
import type { Category, Currency, Group, Member, Offer } from "@/store/model";
import { KErrorCode } from "@/KError";

type FullOffer = Offer & {
  category: Category | null
  member: Member & { group: Group & { currency: Currency } }
}

const props = defineProps<{
  code: string,
  offerCode: string
}>()

const store = useStore()

const offerOptions = computed(() => ({
  code: props.offerCode,
  group: props.code,
  include: "category,member,member.group,member.group.currency"
}))
const { resource: offer, error } = useResource<FullOffer>('offers', offerOptions)

const isReady = computed(() => {
  return Boolean(offer.value && offer.value.member
    && offer.value.member.group && offer.value.member.group.currency)
})
const price = computed(() => {
  return offer.value
    ? formatPrice(offer.value.attributes.value ?? '', offer.value.member.group.currency)
    : ''
})
const canEdit = computed(() => {
  return offer.value?.member?.id == store.getters.myMember?.id || store.getters.isAdmin
})
</script>
