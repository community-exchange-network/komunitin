<template>
  <Error404 v-if="error?.code === KErrorCode.NotFound" :to="`/groups/${code}/members`" />
  <div v-else>
    <page-header :title="$t('member')" :back="isComplete ? `/groups/${code}/members` : '/'">
      <template #buttons>
        <template v-if="member">
          <contact-button
            v-if="!isMe && member.attributes.contacts?.length"
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
          <template v-if="canEdit">
            <q-btn icon="edit" flat round :to="isMe ? '/profile' : `${adminUrl}/profile`" :aria-label="$t('editProfile')" />
            <q-btn icon="settings" flat round :to="isMe ? '/settings' : `${adminUrl}/settings`" :aria-label="$t('settings')" />
          </template>
          <q-btn v-if="isMe && !isComplete" icon="logout" flat round to="/logout" :aria-label="$t('logout')" />
        </template>
      </template>
    </page-header>
    <q-page-container>
      <q-page class="q-pa-md">
        <q-inner-loading :showing="loading || currencyLoading" color="icon-dark" />
        <q-card v-if="member" class="bg-surface q-mb-md">
          <q-card-section :style="{ padding: $q.screen.gt.xs ? '32px 32px 16px' : '24px 16px 16px' }">
            <div class="row items-center justify-center q-col-gutter-x-lg q-col-gutter-y-md">
              <div class="col-auto">
                <avatar
                  size="160px"
                  class="shadow-2"
                  :text="member.attributes.name"
                  :img-src="member.attributes.image"
                />
              </div>
              <div class="col-12 col-sm" :class="{ 'text-center': $q.screen.xs }">
                <h1 class="text-h4 text-serif text-bold text-onsurface q-my-none" style="overflow-wrap: anywhere;">
                  {{ member.attributes.name }}
                </h1>
                <div v-if="account" class="negative-amount text-subtitle2 q-mt-xs">
                  {{ account.attributes.code }}
                </div>
                <member-navigation :code="code" :member="member" />
              </div>
            </div>
          </q-card-section>
          <q-card-section>
            <div
              v-if="currency && account?.attributes.balance !== undefined"
              class="rounded-borders q-pa-md q-mb-md"
              :class="account.attributes.balance >= 0 ? 'positive-amount' : 'negative-amount'"
              style="background-color: color-mix(in srgb, currentColor 10%, transparent);"
            >
              <div class="row items-center q-col-gutter-x-lg q-col-gutter-y-md">
                <div class="member-balance col-12 col-sm-auto">
                  <div class="text-body2 text-onsurface-m q-mb-xs">{{ $t('balance') }}</div>
                  <div class="text-h4 text-serif text-weight-bold">
                    {{ FormatCurrency(account.attributes.balance, currency) }}
                  </div>
                </div>
                <div class="col-12 col-sm-auto">
                  <dl class="q-ma-none text-caption text-onsurface-m">
                    <div class="row justify-between">
                      <dt>{{ $t('creditLimit') }}</dt>
                      <dd class="q-ma-none q-ml-md">{{ FormatCurrency(account.attributes.creditLimit, currency, { decimals: false }) }}</dd>
                    </div>
                    <div v-if="typeof account.attributes.maximumBalance === 'number'" class="row justify-between q-mt-sm">
                      <dt>{{ $t('maximumBalance') }}</dt>
                      <dd class="q-ma-none q-ml-md">{{ FormatCurrency(account.attributes.maximumBalance, currency, { decimals: false }) }}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
            <read-more
              v-if="member.attributes.description"
              class="text-body1 text-onsurface-m q-mb-md"
              :collapsed-height="120"
            >
              <!-- eslint-disable vue/no-v-html -->
              <div v-html="md2html(member.attributes.description)" />
              <!-- eslint-enable vue/no-v-html -->
            </read-more>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <location-map
                  height="250px"
                  :center="mapCenter"
                  :marker="member.attributes.location?.coordinates"
                  :name="member.attributes.location?.name"
                />
              </div>
              <div class="col-12 col-md-6">
                <social-network-list
                  type="contact"
                  :contacts="member.attributes.contacts"
                  flat
                  class="q-py-none"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>
        <create-transaction-btn v-if="member && currency && isComplete && !isMe" />
      </q-page>
    </q-page-container>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import Avatar from '@/components/Avatar.vue'
import ContactButton from '@/components/ContactButton.vue'
import ShareButton from '@/components/ShareButton.vue'
import CreateTransactionBtn from '@/components/CreateTransactionBtn.vue'
import LocationMap from '@/components/LocationMap.vue'
import SocialNetworkList from '@/components/SocialNetworkList.vue'
import ReadMore from '@/components/ReadMore.vue'
import PageHeader from '@/layouts/PageHeader.vue'
import MemberNavigation from './MemberNavigation.vue'
import Error404 from '../Error404.vue'
import { useResource } from '@/composables/useResources'
import type { Account, Currency, Group, Member } from '@/store/model'
import { KErrorCode } from '@/KError'
import md2html from '@/plugins/Md2html'
import FormatCurrency from '@/plugins/FormatCurrency'

const props = defineProps<{
  code: string
  memberCode: string
}>()

const store = useStore()
const isComplete = computed(() => store.getters.isComplete)
const { resource: member, loading, error } = useResource<
  Member & { group: Group, account?: Account }
>('members', () => ({
  group: props.code,
  code: props.memberCode,
  include: 'group,account'
}))
const account = computed(() => member.value?.account)
const { resource: currency, loading: currencyLoading } = useResource<Currency>('currencies', () => ({
  group: props.code
}))
const isMe = computed(() => !!member.value && member.value.id === store.getters.myMember?.id)
const mapCenter = computed(() =>
  member.value?.attributes.location?.coordinates ?? member.value?.group.attributes.location?.coordinates
)
const canEdit = computed(() => isMe.value || store.getters.isAdmin || store.getters.isSuperadmin)
const adminUrl = computed(() => `/groups/${props.code}/admin/members/${props.memberCode}`)

</script>

<style scoped lang="scss">
@media (min-width: $breakpoint-sm-min) {
  .member-balance {
    // Match the avatar's 160px width plus the header's 24px column gutter.
    min-width: 184px;
  }
}
</style>
