<template>
  <page-header :title="$t('deleteAccount')" />
  <q-page-container class="row justify-center">
    <q-page padding class="q-py-lg q-px-md col-12 col-sm-8 col-md-6">
      <template v-if="!deleted">
        <member-header v-if="member" :member="member" :clickable="false" class="q-px-none q-mb-md">
          <template #caption>{{ member.attributes.code }}</template>
        </member-header>
        <p>{{ $t('deleteAccountConfirmation') }}</p>
        <p v-if="failed" role="alert" class="text-negative">{{ $t('deleteAccountEmailError') }}</p>
        <q-btn
          color="negative"
          unelevated
          :label="$t('deleteAccount')"
          :loading="loading"
          :disable="!route.query.token"
          @click="confirm"
        />
        <q-btn v-if="failed" flat :label="$t('settings')" to="/settings" />
      </template>
      <template v-else>
        <p>{{ $t('deleted') }}</p>
        <q-btn color="primary" unelevated :label="$t('home')" to="/" />
      </template>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import PageHeader from '@/layouts/PageHeader.vue'
import MemberHeader from '@/components/MemberHeader.vue'
import { useResource } from '@/composables/useResources'
import type { Member } from '@/store/model'
import { checkFetchResponse } from '@/KError'
import { config } from '@/utils/config'

const route = useRoute()
const store = useStore()
const loading = ref(false)
const deleted = ref(false)
const failed = ref(false)

const { resource: member } = useResource<Member>('members', () => ({
  group: route.params.code as string,
  // Do not fetch the member if the user is not logged in (eg the email link opened in another browser).
  id: store.getters.isLoggedIn ? route.params.memberId as string : null,
}))

const confirm = async () => {
  loading.value = true
  failed.value = false
  try {
    const code = encodeURIComponent(route.params.code as string)
    const memberId = encodeURIComponent(route.params.memberId as string)
    const response = await fetch(`${config.SOCIAL_URL}/${code}/members/${memberId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/vnd.api+json' },
      body: JSON.stringify({ meta: { token: route.query.token } }),
    })
    await checkFetchResponse(response)
    if (store.getters.myMember?.id === route.params.memberId) {
      await store.dispatch('logout')
    }
    deleted.value = true
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
</script>
