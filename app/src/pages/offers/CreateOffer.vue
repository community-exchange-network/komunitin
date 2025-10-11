<template>
  <page-header 
    :title="$t('createOffer')" 
    balance 
    :back="`/groups/${code}/offers`"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6"
    >
      <offer-form 
        :code="code"
        :show-state="false"
        :model-value="offer"
        :loading="loading"
        @submit="onSubmit"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "../../layouts/PageHeader.vue"
import OfferForm from "./OfferForm.vue"
import type { Category, Offer } from "src/store/model"
import { useStore } from "vuex"
import { useRouter } from "vue-router"
import type { DeepPartial } from "quasar"
import { ref } from "vue"

 
const props = defineProps<{
  code: string
}>()

const store = useStore()
const router = useRouter()


const offer = ref<Offer & {category: Category} | undefined>(undefined)

// Load initial values from current resource only if we are comming 
// from the preview page.
const forwardUrl = router.options.history.state.forward
if (typeof forwardUrl === "string" && forwardUrl.endsWith("/preview")) {
  offer.value = store.getters["offers/current"] 
}

const loading = ref(false)

const onSubmit = async (resource: DeepPartial<Offer>) => {
  try {
    loading.value = true
    if (resource.id === undefined) {
      await store.dispatch("offers/create", {
        group: props.code,
        resource
      })
    } else {
      await store.dispatch("offers/update", {
        id: resource.attributes?.code,
        group: props.code,
        resource
      })
    }
  } finally {
    loading.value = false
  }
  
  // Go to preview page.
  const offer = store.getters["offers/current"]
  router.push({
    name: "PreviewOffer",
    params: {
      code: props.code,
      offerCode: offer.attributes.code
    }
  })
}
</script>