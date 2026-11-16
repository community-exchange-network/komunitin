<template>
  <topup-settings-form
    v-if="currency && topupSettings"
    :topup-settings="topupSettings"
    :currency="currency"
    :updating-topup-settings="loadingTopupSettings"
    @update:topup-settings="updateTopupSettings"
  />
  <save-changes ref="changes" class="q-mt-lg" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SaveChanges from '@/components/SaveChanges.vue'
import { useResource } from '@/composables/useResources'
import type { Currency } from '@/store/model'
import TopupSettingsForm from './TopupSettingsForm.vue'
import type { TopupSettings } from './model'
import type { DeepPartial } from 'quasar'

const { code } = defineProps<{ code: string }>()
const changes = ref<InstanceType<typeof SaveChanges>>()
const { resource: currency } = useResource<Currency>('currencies', { group: code })
const { resource: topupSettings, loading: loadingTopupSettings, update } = useResource<TopupSettings>('topup-settings', { group: code })
const updateTopupSettings = (settings: DeepPartial<TopupSettings>) => changes.value!.save(() => update(settings))
</script>
