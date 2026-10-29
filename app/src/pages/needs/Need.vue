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
          color="onsurface-m"
        />
      </template>
    </page-header>
    <!-- A layout footer, so that floating buttons from the slot sit above it. -->
    <q-footer
      v-if="need && isReady"
      class="bg-light shadow-2"
    >
      <q-toolbar class="justify-center q-gutter-x-md">
        <share-button
          outline
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
      </q-toolbar>
    </q-footer>
    <q-page-container>
      <q-page
        v-if="need && isReady"
        class="q-pa-md"
      >
        <offer-layout :num-images="need.attributes.images.length">
          <template #member>
            <member-header
              :to="`/groups/${code}/members/${need.member.attributes.code}`"
              :member="need.member"
              class="bg-surface rounded-borders shadow-2 q-pa-md"
            >
              <template #side>
                <q-icon name="chevron_right" />
              </template>
            </member-header>
          </template>
          <template #category>
            <category-pill
              :style="need.attributes.images.length > 1 && $q.screen.gt.sm ? `transform: translateY(-${72 * Math.ceil(need.attributes.images.length / 4)}px);` : ''"
              type="need"
              :category="need.category"
            />
          </template>
          <template #images>
            <carousel
              :images="need.attributes.images"
              thumbnails
              height="300px"
            />
          </template>
          <template #content>
            <div class="bg-surface rounded-borders shadow-2 q-pa-md q-mb-md">
              <div class="text-h4 text-bold text-serif q-mb-xs">
                {{ title ?? $t('need') }}
              </div>
              <div class="row justify-between items-end text-caption text-muted q-pb-sm"
                style="line-height: 1.7rem;"
              >
                <span>{{ $t('updatedAt', {
                  date: $formatDate(need.attributes.updated)
                }) }}</span>
              </div>
              <q-separator v-if="need.attributes.expires" class="q-mb-sm"/>
              <div v-if="need.attributes.expires" class="text-caption text-muted row items-center">
                <q-icon name="schedule" class="q-mr-xs"/>
                <span>{{ $t('expiresAt', { date: '' }) }}</span>
                <q-chip color="accent-muted" text-color="muted">{{ $formatDate(need.attributes.expires) }}</q-chip>
              </div>
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="col text-body1 text-onsurface bg-surface rounded-borders shadow-2 q-pa-md"
              v-html="md2html(need.attributes.description)"
            />
            <!-- eslint-enable vue/no-v-html -->
          </template>
          <template #map>
            <q-card>
              <simple-map
                class="simple-map"
                :center="need.member.attributes.location?.coordinates"
                :marker="need.member.attributes.location?.coordinates"
              />
              <q-card-section v-if="need.member.attributes.location?.name" class="text-onsurface-m">
                <q-icon name="place" />
                {{ need.member.attributes.location.name }}
              </q-card-section>
            </q-card>
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
import CategoryPill from "../../components/CategoryPill.vue";
import ContactButton from "../../components/ContactButton.vue";
import DeleteNeedBtn from "../../components/DeleteNeedBtn.vue";
import MemberHeader from "../../components/MemberHeader.vue";
import ShareButton from "../../components/ShareButton.vue";
import SimpleMap from "../../components/SimpleMap.vue";
import Error404 from "../Error404.vue";

import { useResource } from "@/composables/useResources";
import type { Need, Member, Category } from "../../store/model";
import { KErrorCode } from "@/KError";

type FullNeed = Need & { member: Member, category: Category | null }

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
const isReady = computed(() => Boolean(need.value && need.value.member))
</script>
