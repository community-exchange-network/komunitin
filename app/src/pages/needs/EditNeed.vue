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
import { ref } from 'vue';
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

const fetchData = async () => {
  await store.dispatch("needs/load", {
    code: props.needCode,
    group: props.code,
    include: "category"
  })
  const fetchedNeed = store.getters["needs/current"]
  // Apply optional URL params.
  const params = route.query
  if (typeof params.state === 'string' && ['hidden', 'published'].includes(params.state)) {
    fetchedNeed.attributes.state = params.state
  }
  if (typeof params.expires === 'string') {
    const expires = new Date(params.expires)
    if (!isNaN(expires.getTime())) {
      fetchedNeed.attributes.expires = expires.toISOString()
    }
  }

  need.value = fetchedNeed
}

fetchData()
const router = useRouter()

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