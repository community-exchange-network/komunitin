<template>
  <topup-settings-form
    v-if="topupSettings"
    :topup-settings="topupSettings"
    :currency="currency!"
    :updating-topup-settings="loadingTopupSettings"
    @update:topup-settings="updateTopupSettings"
  />
  <q-inner-loading :showing="!loaded" color="icon" />
</template>

<script setup lang="ts">
import { useResource } from '@/composables/useResources'
import type { CommunitySettingsContext } from '@/composables/useCommunitySettings'
import TopupSettingsForm from './TopupSettingsForm.vue'
import type { TopupSettings } from './model'
import type { DeepPartial } from 'quasar'

const { settingsContext } = defineProps<{ settingsContext: CommunitySettingsContext }>()
const { code, currency, save } = settingsContext
const { resource: topupSettings, loaded, loading: loadingTopupSettings, update } = useResource<TopupSettings>('topup-settings', { group: code.value })
const updateTopupSettings = (settings: DeepPartial<TopupSettings>) => save(() => update(settings))
</script>
