<template>
  <trustlines-field
    v-if="ready"
    :trustlines="trustlines"
    @update:trustline="update"
    @create:trustline="create"
    @sync:trustlines="load"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import type { DeepPartial } from 'quasar'
import { useResource, useResources } from '@/composables/useResources'
import type { Trustline } from '@/store/model'
import TrustlinesField, { type ExtendedTrustline } from './TrustlinesField.vue'

const { code, save } = defineProps<{ code: string, save: (action: () => Promise<void>) => Promise<void> }>()
const store = useStore()
const { resources: trustlines, load: loadTrustlines } = useResources<ExtendedTrustline>(
  'trustlines', { group: code, include: 'trusted' }, { immediate: false }
)
const { update: updateTrustline, create: createTrustline } =
  useResource<Trustline>('trustlines', { group: code }, { immediate: false })
const ready = ref(false)
const load = async () => {
  await loadTrustlines()
  const codes = trustlines.value.map(line => line.trusted.attributes.code)
  if (codes.length) {
    await store.dispatch('groups/loadList', { filter: { code: codes }, onlyResources: true })
  }
  ready.value = true
}
onMounted(load)

const update = (line: DeepPartial<Trustline>) => {
  return save(() => updateTrustline(line))
}
const create = async (line: DeepPartial<Trustline>) => {
  await save(() => createTrustline(line))
  await load()
}
</script>
