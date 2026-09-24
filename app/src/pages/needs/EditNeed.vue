<template>
  <Error404
    v-if="notFound"
    :to="`/groups/${code}/needs`"
  />
  <template v-else>
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
          :key="need.id"
          :code="code"
          :model-value="need"
          show-state
          :submit-label="$t('save')"
          @submit="onSubmit"
        />
      </q-page>
    </q-page-container>
  </template>
</template>
<script setup lang="ts">
import { useEditablePost } from '@/composables/editablePost'
import PageHeader from "../../layouts/PageHeader.vue"
import NeedForm from "./NeedForm.vue"
import Error404 from '../Error404.vue'
import type { Need } from '../../store/model'
import type { DeepPartial } from 'quasar'
import { useRouter } from 'vue-router'

const props = defineProps<{
  code: string
  needCode: string
}>()
const router = useRouter()
const { resource: need, notFound, update } = useEditablePost<Need>('needs', () => ({
  code: props.needCode,
  group: props.code
}))

const onSubmit = async (resource: DeepPartial<Need>) => {
  await update(resource)
  // Go to need page.
  router.replace({
    name: "Need",
    params: {
      code: props.code,
      needCode: need.value?.attributes.code
    }
  })
}
</script>
