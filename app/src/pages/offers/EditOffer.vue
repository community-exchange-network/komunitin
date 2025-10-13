<template>
  <page-header 
    :title="$t('editOffer')" 
    balance 
    :back="`/groups/${code}/offers/${offerCode}`"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6"
    >
      <offer-form 
        v-if="offer"
        :code="code"
        :model-value="offer"
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
import OfferForm from "./OfferForm.vue"
import { useStore } from 'vuex';
import type { Offer, Category } from '../../store/model';
import type { DeepPartial } from 'quasar';
import { useRouter } from 'vue-router';

const props = defineProps<{
  code: string
  offerCode: string
}>()
const store = useStore()
const offer = ref<Offer & {category: Category} | null>(null)

const fetchData = async () => {
  await store.dispatch("offers/load", {
    id: props.offerCode,
    group: props.code,
    include: "category"
  })
  offer.value = store.getters["offers/current"]
}

fetchData()
const router = useRouter()

const onSubmit = async (resource: DeepPartial<Offer>) => {
  await store.dispatch("offers/update", {
    id: resource.attributes?.code,
    group: props.code,
    resource
  })
  const offer = store.getters["offers/current"]
  // Go to offer page.
  router.push({
    name: "Offer",
    params: {
      code: props.code,
      offerCode: offer.attributes.code
    }
  })
}
</script>