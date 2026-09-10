<template>
  <page-header 
    :title="$t('editNeed')" 
    balance 
    :back="`/groups/${code}/needs/${needCode}`"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6"
    >
      <need-form 
        v-if="need"
        :code="code"
        :model-value="need"
        show-state
        :submit-label="$t('save')"
        @submit="onSubmit"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import KError, { KErrorCode } from 'src/KError'
import { usePostPermissions } from 'src/composables/postPermissions'
import PageHeader from "../../layouts/PageHeader.vue"
import NeedForm from "./NeedForm.vue"
import { useStore } from 'vuex';
import type { Need, Category } from '../../store/model';
import type { DeepPartial } from 'quasar';
import { useRouter, useRoute } from 'vue-router';

const props = defineProps<{
  code: string
  needCode: string
}>()
const store = useStore()
const route = useRoute()
const need = ref<Need & {category: Category} |null>(null)

const router = useRouter()
const canEdit = usePostPermissions()

watch(() => [props.code, props.needCode], async (_value, _oldValue, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  need.value = null
  try {
    const id = await store.dispatch("needs/load", {
      code: props.needCode,
      group: props.code,
      include: "category"
    })
    if (cancelled) return
    const fetchedNeed = store.getters["needs/one"](id)
    if (!canEdit(fetchedNeed, props.code)) {
      throw new KError(KErrorCode.Forbidden)
    }

    // Apply optional URL params only after checking edit access.
    const params = route.query
    if (typeof params.state === 'string' && ['hidden', 'published'].includes(params.state)) {
      fetchedNeed.attributes.status = params.state
    }
    if (typeof params.expires === 'string') {
      const expires = new Date(params.expires)
      if (!isNaN(expires.getTime())) {
        fetchedNeed.attributes.expires = expires.toISOString()
      }
    }
    need.value = fetchedNeed
  } catch (error) {
    if (!cancelled) {
      if (error instanceof KError && [KErrorCode.Forbidden, KErrorCode.NotFound].includes(error.code as KErrorCode)) {
        await router.replace('/404')
      } else {
        throw error
      }
    }
  }
}, { immediate: true })

const onSubmit = async (resource: DeepPartial<Need>) => {
  await store.dispatch("needs/update", {
    group: props.code,
    id: resource.id,
    resource
  })
  const need = store.getters["needs/current"]
  // Go to need page.
  router.replace({
    name: "Need",
    params: {
      code: props.code,
      needCode: need.attributes.code
    }
  })
}
</script>
