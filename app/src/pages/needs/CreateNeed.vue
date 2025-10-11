<template>
  <page-header 
    :title="$t('createNeed')" 
    balance 
    :back="`/groups/${code}/needs`"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6"
    >
      <need-form 
        :code="code"
        :show-state="false"
        :model-value="need"
        @submit="onSubmit"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "../../layouts/PageHeader.vue"
import NeedForm from "./NeedForm.vue"
import type { Category, Need } from "src/store/model"
import { useStore } from "vuex"
import { useRouter } from "vue-router"
import type { DeepPartial } from "quasar"
import { ref } from "vue"

 
const props = defineProps<{
  code: string
}>()

const store = useStore()
const router = useRouter()

const need = ref<Need & {category: Category} | undefined>(undefined)

// Load initial values from current resource only if we are comming 
// from the preview page.
const forwardUrl = router.options.history.state.forward
if (typeof forwardUrl === "string" && forwardUrl.endsWith("/preview")) {
  need.value = store.getters["needs/current"] 
}

const onSubmit = async (resource: DeepPartial<Need>) => {
  if (resource.id === undefined) {
    await store.dispatch("needs/create", {
      group: props.code,
      resource
    })
  } else {
    await store.dispatch("needs/update", {
      id: resource.attributes?.code,
      group: props.code,
      resource
    })
  }

  const need = store.getters["needs/current"]

  // Go to needs page.
  router.push({
    name: "PreviewNeed",
    params: {
      code: props.code,
      needCode: need.attributes.code
    }
  })
}
</script>