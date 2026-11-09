<template>
  <Error404 v-if="error?.code === KErrorCode.NotFound" :to="`/groups/${code}/members`" />
  <div v-else>
    <page-header :title="title" :back="profileUrl">
      <template #buttons />
    </page-header>
    <q-page-container>
      <q-page class="q-pa-md">
        <q-inner-loading :showing="loading" color="icon" />
        <template v-if="member">
          <q-card class="bg-surface" :class="{ 'q-mb-md': page === 'transfers' }">
            <q-card-section>
              <router-link :to="profileUrl" class="row items-center q-col-gutter-md text-on-surface" style="text-decoration: none;">
                <div class="col-auto">
                  <avatar size="56px" :text="member.attributes.name" :img-src="member.attributes.image" />
                </div>
                <div class="col">
                  <h1 class="text-h5 text-serif text-bold q-my-none" style="overflow-wrap: anywhere;">
                    {{ member.attributes.name }}
                  </h1>
                  <div v-if="member.account" class="text-amount-negative text-subtitle2 q-mt-xs">
                    {{ member.account.attributes.code }}
                  </div>
                </div>
              </router-link>
              <member-navigation :code="code" :member="member" :page="page" />
            </q-card-section>
          </q-card>
          <transaction-items v-if="page === 'transfers'" :key="member.id" :code="code" :member="member" />
          <resource-cards
            v-else
            :key="`${member.id}/${page}`"
            :code="code"
            :type="page"
            include="category"
            :filter="filter"
            style="margin: 0 -16px;"
          />
          <floating-btn
            v-if="isMe && page !== 'transfers'"
            icon="add"
            :color="page === 'offers' ? 'offer' : 'want'"
            :to="`/groups/${code}/${page}/new`"
            :label="page === 'offers' ? $t('createOffer') : $t('createNeed')"
          />
          <create-transaction-btn v-if="isComplete && (!isMe || page === 'transfers')" />
        </template>
      </q-page>
    </q-page-container>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'
import Avatar from '@/components/Avatar.vue'
import CreateTransactionBtn from '@/components/CreateTransactionBtn.vue'
import FloatingBtn from '@/components/FloatingBtn.vue'
import PageHeader from '@/layouts/PageHeader.vue'
import MemberNavigation from './MemberNavigation.vue'
import ResourceCards from '../ResourceCards.vue'
import TransactionItems from '../transactions/TransactionItems.vue'
import Error404 from '../Error404.vue'
import { useResource } from '@/composables/useResources'
import type { Account, Member } from '@/store/model'
import { KErrorCode } from '@/KError'

const props = defineProps<{
  code: string
  memberCode: string
  page: 'offers' | 'needs' | 'transfers'
}>()

const store = useStore()
const { t } = useI18n()
const isComplete = computed(() => store.getters.isComplete)
const { resource: member, loading, error } = useResource<
  Member & { account?: Account }
>('members', () => ({
  group: props.code,
  code: props.memberCode,
  include: isComplete.value || store.getters.isSuperadmin ? 'group,account' : 'group'
}))
const isMe = computed(() => !!member.value && member.value.id === store.getters.myMember?.id)
const profileUrl = computed(() => `/groups/${props.code}/members/${props.memberCode}`)
const title = computed(() => ({
  offers: isMe.value ? t('yourOffers') : t('memberOffers'),
  needs: isMe.value ? t('yourNeeds') : t('memberNeeds'),
  transfers: isMe.value ? t('yourTransactions') : t('memberTransactions')
})[props.page])
const canEditPosts = computed(() => isMe.value || store.getters.isAdmin)
const filter = computed(() => member.value && ({
  member: member.value.id,
  expired: canEditPosts.value ? 'false,true' : 'false',
  status: canEditPosts.value ? 'published,hidden,draft' : 'published'
}))
</script>
