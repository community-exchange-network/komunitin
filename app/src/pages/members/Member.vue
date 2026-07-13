<template>
  <div v-if="!isLoading">
    <page-header 
      :title="member.attributes.name"
      :back="isComplete ? `/groups/${code}/members` : ''"
    >
      <template #buttons>
        <contact-button
          v-if="!isMe && member.attributes.contacts"
          icon="message"
          round
          flat
          :contacts="member.attributes.contacts"
        />
        <share-button
          icon="share"
          flat
          round
          :title="$t('shareMember', { member: member.attributes.name })"
          :text="member.attributes.description ?? ''"
        />
        <q-btn
          v-if="canEdit"
          icon="edit"
          flat
          round
          :to="editProfileUrl"
        />
        <q-btn
          v-if="canEdit"
          icon="settings"
          flat
          round
          :to="settingsUrl"
        />
        <q-btn
          v-if="isMe && !isComplete"
          icon="logout"
          flat
          round
          to="/logout"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page>
        <member-page-header
          :member="member"
          :tab="hashTab"
          :transactions="!isMe"
          :needs-count="needsCount"
          :offers-count="offersCount"
          @tab-change="onTabChange"
        />
        <q-tab-panels
          :model-value="hashTab"  
          @update:model-value="onTabChange"
        >
          <q-tab-panel
            name="profile"
            keep-alive
          >
            <member-profile :member="member" />
          </q-tab-panel>
          <q-tab-panel
            name="needs"
            keep-alive
          >
            <member-needs
              :member="member"
              :group-code="code"
            />
            <floating-btn
              v-if="isMe"
              icon="add"
              color="kred"
              :to="`/groups/${code}/needs/new`"
              :label="$t('createNeed')"
            />
          </q-tab-panel>
          <q-tab-panel
            name="offers"
            keep-alive
          >
            <member-offers
              :member="member"
              :group-code="code"
            />
            <floating-btn
              v-if="isMe"
              icon="add"
              color="kblue"
              :to="`/groups/${code}/offers/new`"
              :label="$t('createOffer')"
            />
          </q-tab-panel>
          <q-tab-panel
            v-if="!isMe"
            name="transactions"
            keep-alive
          >
            <transaction-items
              :code="code"
              :member="member"
            />
          </q-tab-panel>
        </q-tab-panels>
        <create-transaction-btn v-if="!isMe" />
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { computed, shallowRef, watch } from "vue"
import { useStore } from "vuex";
import { useRoute, useRouter } from "vue-router";

import PageHeader from "../../layouts/PageHeader.vue";

import ContactButton from "../../components/ContactButton.vue";
import MemberNeeds from "./MemberNeeds.vue";
import MemberOffers from "./MemberOffers.vue";
import MemberPageHeader from "./MemberPageHeader.vue";
import MemberProfile from "./MemberProfile.vue";
import ShareButton from "../../components/ShareButton.vue";
import CreateTransactionBtn from "../../components/CreateTransactionBtn.vue";
import TransactionItems from "../transactions/TransactionItems.vue";
import FloatingBtn from "src/components/FloatingBtn.vue";


const props = defineProps<{
  code: string,
  memberCode: string
}>()

const store = useStore()

const myMember = computed(() => store.getters.myMember)
const isComplete = computed(() => store.getters.isComplete)

const fetched = shallowRef(false)
const isLoading = computed(() => !(fetched.value || member.value && (!isComplete.value || member.value.account !== null)))
const needsCount = computed(() => member.value.relationships.needs.meta.count)
const offersCount = computed(() => member.value.relationships.offers.meta.count)

const fetchData = async (memberCode: string) => {
  fetched.value = false
  await store.dispatch("members/load", {
    code: memberCode,
    group: props.code,
    include: isComplete.value ? "account" : undefined
  });
  fetched.value = true;
}
watch(() => props.memberCode, (code) => fetchData(code), {immediate: true})

const member = computed(() => fetched.value ? store.getters['members/current'] : undefined)
const isMe = computed(() => member.value && myMember.value && member.value.id == myMember.value.id)
const canEdit = computed(() => isMe.value || store.getters.isAdmin || store.getters.isSuperadmin)
const editProfileUrl = computed(() => isMe.value ? "/profile" : `/groups/${props.code}/admin/members/${props.memberCode}/profile`)
const settingsUrl = computed(() => isMe.value ? "/settings" : `/groups/${props.code}/admin/members/${props.memberCode}/settings`)

// Tab and hash navigation.
const route = useRoute()
const router = useRouter()

const tabs = ['profile', 'needs', 'offers', 'transactions']

const hashTab = computed(() => {
  const hash = route.hash.slice(1)
  return tabs.includes(hash) ? hash : 'profile'
})

const onTabChange = (tab: string | number) => {  
  router.replace({hash: `#${tab}`})
}
</script>
