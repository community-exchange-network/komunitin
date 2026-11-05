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
    <q-page-container>
      <q-page
        v-if="need && isReady"
        class="q-pa-md"
      >
        <post-layout :post="need" :code="code">
          <template #actions>
            <contact-button
              unelevated
              color="primary"
              :label="$t('contact')"
              :contacts="need.member.attributes.contacts"
            />
            <share-button
              outline
              color="primary"
              :label="$t('share')"
              :title="$t('checkThisNeed', {member: need.member.attributes.name})"
              :text="need.attributes.description"
            />
          </template>
        </post-layout>
        <!-- Reserve room for the preview's floating publish action. -->
        <div v-if="$slots.after" class="q-pa-xl">
          <slot name="after" :need="need" />
        </div>
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";

import PostLayout from "../../layouts/PostLayout.vue";
import PageHeader from "../../layouts/PageHeader.vue";

import ContactButton from "../../components/ContactButton.vue";
import DeleteNeedBtn from "../../components/DeleteNeedBtn.vue";
import ShareButton from "../../components/ShareButton.vue";
import Error404 from "../Error404.vue";

import { useResource } from "@/composables/useResources";
import type { Need, Member, Category, Group } from "../../store/model";
import { KErrorCode } from "@/KError";

type FullNeed = Need & {
  member: Member & { group: Group }
  category: Category | null
}

const props = defineProps<{
  code: string
  needCode: string
  title?: string
}>()

const store = useStore()
const needOptions = computed(() => ({
  code: props.needCode,
  group: props.code,
  include: "category,member,member.account,member.group"
}))
const { resource: need, error } = useResource<FullNeed>('needs', needOptions)
const canEdit = computed(() =>
  need.value?.member?.id === store.getters.myMember?.id || store.getters.isAdmin
)
const isReady = computed(() => Boolean(need.value && need.value.member && need.value.member.group))
</script>
