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
import { useRouter } from 'vue-router';

const props = defineProps<{
  code: string
  needCode: string
}>()
const store = useStore()
const need = ref<Need & {category: Category} |null>(null)

const fetchData = async () => {
  await store.dispatch("needs/load", {
    id: props.needCode,
    group: props.code,
    include: "category"
  })
  need.value = store.getters["needs/current"]
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
  router.push({
    name: "Need",
    params: {
      code: props.code,
      needCode: need.attributes.code
    }
  })
}
</script>