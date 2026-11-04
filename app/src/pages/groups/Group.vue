<template>
  <Error404
    v-if="error?.code === KErrorCode.NotFound"
    to="/groups"
  />
  <div v-else>
    <page-header
      :title="$t('group')"
      :back="own ? '' : '/groups'"
    >
      <template #buttons>
        <contact-button
          v-if="!loading && group"
          icon="message"
          round
          flat
          :contacts="group.attributes.contacts"
        />
        <share-button
          v-if="group"
          icon="share"
          flat
          round
          :title="$t('checkTheExchangeCommunityGroup', {group: group.attributes.name})"
          :text="group.attributes.description"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page class="q-pa-md">
        <!-- Loading spinner -->
        <q-inner-loading
          :showing="loading"
          color="icon-dark"
        />
        <q-card v-if="group" class="bg-surface">
          <q-card-section
            :style="{padding: $q.screen.gt.xs ? '32px 32px 16px' : '24px 16px 16px'}"
          >
            <div class="row items-center justify-center q-col-gutter-x-lg q-col-gutter-y-md">
              <div class="col-auto">
                <avatar
                  class="shadow-2"
                  size="160px"
                  :text="group.attributes.name"
                  :img-src="group.attributes.image"
                />
              </div>
              <div class="col-12 col-sm" :class="{ 'text-center': $q.screen.xs }">
                <h1 class="text-h4 text-serif text-bold text-onsurface q-my-none" style="overflow-wrap: anywhere;">
                  {{ group.attributes.name }}
                </h1>
                <div class="text-subtitle2 text-uppercase text-secondary q-mt-xs">
                  {{ group.attributes.code }}
                </div>
                <nav v-if="own" class="row q-gutter-sm q-mt-md" :class="{ 'justify-center': $q.screen.xs }">
                  <nav-button
                    :to="`/groups/${code}/members`"
                    icon="people"
                    :label="$t('members')"
                    :count="group.relationships.members.meta.count"
                  />
                  <nav-button
                    :to="`/groups/${code}/stats`"
                    icon="bar_chart"
                    :label="$t('statistics')"
                  />
                </nav>
              </div>
            </div>
          </q-card-section>
          <q-card-section>
            <read-more class="text-body1 text-onsurface-m" :collapsed-height="120">
              <!-- eslint-disable vue/no-v-html -->
              <div v-html="md2html(group.attributes.description)" />
              <!-- eslint-enable vue/no-v-html -->
            </read-more>
          </q-card-section>
          <q-card-section class="q-pt-none">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <group-members-map :group="group" />
              </div>
              <div class="col-12 col-md-6">
                <social-network-list
                  type="contact"
                  :contacts="group.attributes.contacts"
                  flat
                  class="q-py-none"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>
        <div v-if="group && (!isLoggedIn || !myMember)" class="q-pa-xl">
          <floating-btn
            :label="$t('signUp')"
            icon="add"
            color="primary"
            :to="`/groups/${group.attributes.code}/signup`"
          />
        </div>
      </q-page>
    </q-page-container>
  </div>
</template>

<script setup lang="ts">
/**
 * Page for Group details.
 */
import { computed } from 'vue'
import { useStore } from 'vuex'

import md2html from '../../plugins/Md2html'

import PageHeader from '../../layouts/PageHeader.vue'
import Avatar from '../../components/Avatar.vue'
import ContactButton from '../../components/ContactButton.vue'
import ShareButton from '../../components/ShareButton.vue'
import SocialNetworkList from '../../components/SocialNetworkList.vue'
import FloatingBtn from '../../components/FloatingBtn.vue'
import NavButton from '../../components/NavButton.vue'
import ReadMore from '../../components/ReadMore.vue'
import Error404 from '../Error404.vue'
import GroupMembersMap from './GroupMembersMap.vue'

import type { Group } from '../../store/model'
import { useResource } from '@/composables/useResources'
import { KErrorCode } from '@/KError'

const props = defineProps<{ code: string }>()

const store = useStore()

const isLoggedIn = computed(() => store.getters.isLoggedIn)
const myMember = computed(() => store.getters.myMember)
const groupOptions = computed(() => ({ group: props.code }))
const { resource: group, loading, error } = useResource<Group>('groups', groupOptions)
const own = computed(() => !!group.value && group.value.id === myMember.value?.group.id)
</script>
