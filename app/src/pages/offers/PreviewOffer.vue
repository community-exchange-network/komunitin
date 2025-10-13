<template>
  <offer-page
    :code="code"
    :offer-code="offerCode"
    :title="$t('previewOffer')"
  >
    <template #after="{offer}">
      <floating-btn 
        :label="$t('publishOffer')"
        color="kblue"
        icon="publish"
        @click="publish(offer)"
      />
    </template>
  </offer-page>
</template>
<script setup lang="ts">
import { useQuasar } from 'quasar';
import FloatingBtn from '../../components/FloatingBtn.vue'
import { useI18n } from 'vue-i18n'
import OfferPage from './Offer.vue'
import type { Offer } from '../../store/model'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { computed } from 'vue';

 
const props = defineProps<{
  code: string,
  offerCode: string
}>()

const $q = useQuasar()
const { t } = useI18n()
const store = useStore()
const router = useRouter()

const myMember = computed(() => store.getters.myMember)

const publish = async (offer: Offer) => {
  offer.attributes.state = 'published'

  await store.dispatch('offers/update', {
    id: props.offerCode,
    group: props.code,
    resource: offer
  })

  $q.notify({
    message: t('offerPublished'),
    type: 'positive'
  })

  router.push({
    path: `/groups/${props.code}/members/${myMember.value.attributes.code}`,
    hash: '#offers'
  })
}

</script>