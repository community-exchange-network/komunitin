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
        :currency="currency"
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
import OfferForm from "./OfferForm.vue"
import { useStore } from 'vuex';
import type { Offer, Category, Currency } from '../../store/model';
import type { DeepPartial } from 'quasar';
import { useRouter, useRoute } from 'vue-router';

const props = defineProps<{
  code: string
  offerCode: string
}>()
const store = useStore()
const route = useRoute()
const currency = ref<Currency>()
const offer = ref<Offer & {category: Category} | null>(null)

const router = useRouter()
const canEdit = usePostPermissions()

watch(() => [props.code, props.offerCode], async (_value, _oldValue, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  offer.value = null
  try {
    const id = await store.dispatch("offers/load", {
      code: props.offerCode,
      group: props.code,
      include: "category"
    })
    if (cancelled) return
    const fetchedOffer = store.getters["offers/one"](id)
    if (!canEdit(fetchedOffer, props.code)) {
      throw new KError(KErrorCode.Forbidden)
    }
    await store.dispatch("currencies/load", { group: props.code })
    if (cancelled) return
    currency.value = store.getters["currencies/current"]

    // Apply optional URL params only after checking edit access.
    const params = route.query
    if (typeof params.state === 'string' && ['hidden', 'published'].includes(params.state)) {
      fetchedOffer.attributes.status = params.state
    }
    if (typeof params.expires === 'string') {
      const expires = new Date(params.expires)
      if (!isNaN(expires.getTime())) {
        fetchedOffer.attributes.expires = expires.toISOString()
      }
    }
    offer.value = fetchedOffer
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

const onSubmit = async (resource: DeepPartial<Offer>) => {
  await store.dispatch("offers/update", {
    id: resource.id,
    group: props.code,
    resource
  })
  const offer = store.getters["offers/current"]
  // Go to offer page.
  router.replace({
    name: "Offer",
    params: {
      code: props.code,
      offerCode: offer.attributes.code
    }
  })
}
</script>
