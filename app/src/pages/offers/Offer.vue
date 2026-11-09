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
          color="on-surface-medium"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page
        v-if="offer && isReady"
        class="q-pa-md"
      >
        <post-layout :post="offer" :code="code">
          <template #header>
            <div class="text-h4 text-bold text-serif q-mb-md">
              {{ offer.attributes.title }}
            </div>
            <div class="q-mb-md">
              <span class="text-caption text-on-surface-variant q-mr-xs">{{ $t('price') }}</span>
              <span class="text-h5 text-bold text-amount-positive">{{ price }}</span>
            </div>
          </template>
          <template #actions>
            <contact-button
              unelevated
              color="primary"
              :label="$t('contact')"
              :contacts="offer.member.attributes.contacts"
            />
            <share-button
              outline
              color="primary"
              :label="$t('share')"
              :title="$t('checkThisOffer', {member: offer.member.attributes.name})"
              :text="`${offer.attributes.title}\n${offer.attributes.description}`"
            />
          </template>
        </post-layout>
        <!-- Reserve room for the preview's floating publish action. -->
        <div v-if="$slots.after" class="q-pa-xl">
          <slot name="after" :offer="offer" />
        </div>
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";

import PostLayout from "../../layouts/PostLayout.vue";
import PageHeader from "../../layouts/PageHeader.vue";

import ContactButton from "../../components/ContactButton.vue";
import DeleteOfferBtn from "../../components/DeleteOfferBtn.vue";
import ShareButton from "../../components/ShareButton.vue";
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
