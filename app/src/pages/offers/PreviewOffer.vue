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
import type { Member, Offer } from '../../store/model'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'

 
const props = defineProps<{
  code: string,
  offerCode: string
}>()

const $q = useQuasar()
const { t } = useI18n()
const store = useStore()
const router = useRouter()

type FullOffer = Offer & { member: Member }

const publish = async (offer: FullOffer) => {
  await store.dispatch('offers/update', {
    id: offer.id,
    group: props.code,
    resource: {
      id: offer.id,
      type: 'offers',
      attributes: {
        status: 'published'
      }
    }
  })

  $q.notify({
    message: t('offerPublished'),
    type: 'positive'
  })

  router.push({
    path: `/groups/${props.code}/members/${offer.member.attributes.code}`,
    hash: '#offers'
  })
}

</script>
