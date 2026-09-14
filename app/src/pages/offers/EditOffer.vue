<template>
  <Error404
    v-if="notFound"
    :to="`/groups/${code}/offers`"
  />
  <template v-else>
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
          v-if="offer && currency"
          :key="offer.id"
          :code="code"
          :model-value="offer"
          :currency="currency"
          show-state
          :submit-label="$t('save')"
          @submit="onSubmit"
        />
      </q-page>
    </q-page-container>
  </template>
</template>
<script setup lang="ts">
import { useEditablePost } from 'src/composables/editablePost'
import { useResource } from 'src/composables/useResources'
import PageHeader from "../../layouts/PageHeader.vue"
import OfferForm from "./OfferForm.vue"
import Error404 from '../Error404.vue'
import type { Offer, Currency } from '../../store/model'
import type { DeepPartial } from 'quasar'
import { useRouter } from 'vue-router'

const props = defineProps<{
  code: string
  offerCode: string
}>()
const router = useRouter()
const { resource: offer, notFound, update } = useEditablePost<Offer>('offers', () => ({
  code: props.offerCode,
  group: props.code
}))
const { resource: currency } = useResource<Currency>('currencies', () => ({ group: props.code }))

const onSubmit = async (resource: DeepPartial<Offer>) => {
  await update(resource)
  // Go to offer page.
  router.replace({
    name: "Offer",
    params: {
      code: props.code,
      offerCode: offer.value?.attributes.code
    }
  })
}
</script>
