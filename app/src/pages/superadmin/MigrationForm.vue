<template>
  <q-form @submit="onSubmit">
    <q-select
      v-model="code"
      :options="codes"
      label="Currency Code"
      outlined
      emit-value
      map-options
      :rules="[val => !!val || 'Code is required']"
      class="q-mb-md"
    />
    <q-input
      v-model="name"
      label="Migration Name"
      outlined
      :rules="[val => !!val || 'Name is required']"
      class="q-mb-md"
    />
    <q-select
      v-model="kind"
      :options="[{ label: 'Integralces Accounting', value: 'integralces-accounting' }]"
      label="Migration Kind"
      outlined
      emit-value
      map-options
      disable
      :rules="[val => !!val || 'Kind is required']"
      class="q-mb-md"
    />
    <template v-if="kind === 'integralces-accounting'">
      <q-input
        v-model="sourceUrl"
        label="IntegralCES URL"
        outlined
        class="q-mb-md col-6"
        @blur="fetchCurrencies"
      />
      <q-input
        v-model="accessToken"
        label="Access Token"
        outlined
        class="q-mb-md col-6"
      />
      <q-input
        v-model="expiresAt"
        label="Expires At"
        outlined
        class="q-mb-md col-6"
      />
      <q-input
        v-model="refreshToken"
        label="Refresh Token"
        outlined
        class="q-mb-md col-6"
      />
    </template>

    <q-btn
      type="submit"
      label="Create Migration"
      color="primary"
      unelevated
      class="full-width"
    />
  </q-form>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Migration } from './migrations'
import { KOptions } from '../../boot/koptions';
import { Group } from '../../store/model';
import { useStore } from 'vuex';

const defaultSourceUrl = new URL(KOptions.url.social).origin;

const model = defineModel<Partial<Migration> | undefined>()
const store = useStore()

const code = ref(model.value?.code ?? '')
const name = ref(model.value?.name ?? '')
const kind = ref(model.value?.kind ?? 'integralces-accounting')

const sourceUrl = ref(model.value?.data?.source.url ?? defaultSourceUrl)

const refreshToken = ref(model.value?.data?.source.tokens.refreshToken ?? '')
const accessToken = ref(model.value?.data?.source.tokens.accessToken ?? '')
const expiresAt = ref(model.value?.data?.source.tokens.expiresAt ?? '')

const refreshTokens = async () => {
  await store.dispatch('authorize', { force: true })
  refreshToken.value = store.state.tokens.refreshToken
  accessToken.value = store.state.tokens.accessToken
  expiresAt.value = store.state.tokens.accessTokenExpire.toISOString()
}

if (accessToken.value === '') {
  refreshTokens()
}

const emit = defineEmits<{
  (e: 'submit'): void
}>()

const codes = ref<{ label: string; value: string }[]>([])
const groups = ref<Group[]>([])

const fetchCurrencies = async () => {
  const token = store.getters.accessToken
  let url = `${sourceUrl.value}/ces/api/social/groups`
    do {
      const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to fetch migrations: ${error.message}`)
    }
    const data = await response.json()
    groups.value = [...groups.value, ...data.data]
    url = data.links.next  
    
  } while (url != null)
  
  
  codes.value = groups.value.map((currency: Group) => ({
    label: currency.attributes.code + ' (' + currency.attributes.name + ')',
    value: currency.attributes.code
  }))
}

watch(code, (newCode: string) => {
  const newName = groups.value.find(group => group.attributes.code === newCode)?.attributes.name
  if (newName) {
    name.value = newName
  }
})

const onSubmit = () => {
  model.value = {
    ...model.value,
    code: code.value,
    name: name.value,
    kind: kind.value,
    data: {
      source: {
        url: sourceUrl.value,
        tokens: {
          refreshToken: refreshToken.value,
          accessToken: accessToken.value,
          expiresAt: expiresAt.value
        }
      }
    }  
  }
  emit('submit')
}

fetchCurrencies()

</script>