<template>
  <div>
    <page-header
      :title="group ? group.attributes.name : ''"
      :back="own ? '' : '/groups'"
    >
      <template #buttons>
        <contact-button
          v-if="group"
          icon="message"
          round
          flat
          :contacts="group.contacts"
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
          :showing="isLoading"
          color="icon-dark"
        />
        <!-- Group view -->

        <div
          v-if="group"
          class="row q-col-gutter-md"
        >
          <!-- image -->
          <div class="col-4 q-px-md">
            <div class="q-mx-auto" style="max-width: 152px; line-height: 0;">
              <fit-text update>
                <avatar
                  size="inherit"
                  :text="group.attributes.name"
                  :img-src="group.attributes.image"
                />
              </fit-text>
            </div>
          </div>

          <!-- description -->
          <div class="col column">
            <div class="text-h6">
              {{ group.attributes.code }}
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="text-onsurface-m"
              :class="isDescriptionOpen ? '' : 'ellipsis-3-lines'"
              v-html="md2html(group.attributes.description)"
            />

            <q-btn
              flat
              round
              dense
              :icon="isDescriptionOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
              style="margin-left:auto;"
              @click="toggleDescription"
            />
          </div>
        </div>
        <!-- sub-page navigation -->
        <nav
          v-if="group"
          class="row q-col-gutter-md q-py-md"
        >
          <router-link :to="`/groups/${code}/members`" 
            style="text-decoration: none; color: inherit; height: fit-content;"
            class="col-6"
          >
            <q-card
              flat
              class="transition-all bg-active text-onsurface-m"
            >
              <q-card-section class="text-center">
                <q-icon name="people" size="sm"/>
                <div class="text-body2 text-weight-medium">
                  {{ $t('members') }}
                </div>
              </q-card-section>
            </q-card>
          </router-link>

          <router-link :to="`/groups/${code}/stats`" 
            style="text-decoration: none; color: inherit; height: fit-content;"
            class="col-6"
          >
            <q-card
              flat
              class="transition-all bg-active text-onsurface-m"
            >
              <q-card-section class="text-center">
                <q-icon name="insert_chart" size="sm"/>
                <div class="text-body2 text-weight-medium">
                  {{ $t('statistics') }}
                </div>
              </q-card-section>
            </q-card>
          </router-link>
        </nav>
        <div
          v-if="group"
          class="row q-col-gutter-md"
        >
          <div class="col-12 col-sm-6 col-lg-8">
            <q-card
              square
              flat
            >
              <simple-map
                class="simple-map"
                :center="center"
                :marker="marker"
                :bounds="memberMarkers"
              >
                <l-marker
                  v-for="(memberMarker, i) of memberMarkers"
                  :key="i"
                  :lat-lng="memberMarker"
                />
              </simple-map>
              <q-card-section class="group-footer-card text-onsurface-m">
                <q-icon name="place" />
                {{ group.attributes.location.name }}
              </q-card-section>
            </q-card>
          </div>
          <div class="col-12 col-sm-6 col-lg-4 relative-position">
            <social-network-list
              type="contact"
              :contacts="group.contacts"
            />
          </div>
          <floating-btn
            v-if="!isLoggedIn"
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
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';

import { LMarker } from '@vue-leaflet/vue-leaflet';
import type { LatLngExpression } from 'leaflet';

import md2html from '../../plugins/Md2html';

import PageHeader from '../../layouts/PageHeader.vue';
import Avatar from '../../components/Avatar.vue';
import ContactButton from '../../components/ContactButton.vue';
import ShareButton from '../../components/ShareButton.vue';
import SimpleMap from '../../components/SimpleMap.vue';
import SocialNetworkList from '../../components/SocialNetworkList.vue';
import FloatingBtn from '../../components/FloatingBtn.vue';
import FitText from '../../components/FitText.vue';

import type { Group, Contact, Member } from '../../store/model';
import { useResources } from 'src/composables/useResources';

const props = defineProps<{ code: string }>()

const store = useStore();

const isLoading = ref(false);
const isDescriptionOpen = ref(false);

const isLoggedIn = computed(() => store.getters.isLoggedIn);
const group = computed<Group & { contacts: Contact[] }>(() => store.getters['groups/current']);
const own = computed(
  () => group.value && store.getters['myMember'] && group.value.id == store.getters['myMember'].group.id
);
const center = computed(() => group.value?.attributes.location.coordinates);
const marker = computed(() => center.value);
const memberMarkers = computed<LatLngExpression[]>(() => {
  return (members.value ?? [])
    .map((member: Member) => member.attributes?.location?.coordinates.slice().reverse())
    .filter(Boolean) as LatLngExpression[];
});

const toggleDescription = () => {
  isDescriptionOpen.value = !isDescriptionOpen.value;
};

const loadGroup = async (code: string) => store.dispatch('groups/load', { group: code, include: 'contacts' });

const {
  resources: members,
  hasNext: hasNextMembers,
  loadNext: loadNextMembers,
  load: loadMembers,
} = useResources('members', { group: props.code }, { immediate: false });
const fetchData = async (code: string) => {
  isLoading.value = true;
  await loadGroup(code);
  if (isLoggedIn.value) {
    await loadMembers();
    while (hasNextMembers.value) {
      await loadNextMembers();
    }
  }
  isLoading.value = false;
};

watch(() => props.code, fetchData, { immediate: true });
</script>
