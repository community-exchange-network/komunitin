<template>
  <delete-btn @confirm="deleteOffer">
    <i18n-t
      keypath="deleteOffer"
      scope="global"
    >
      <template #name>
        <b>
          {{ name }}
        </b>
      </template>
    </i18n-t>
  </delete-btn>
</template>
<script setup lang="ts">
import type { DeepPartial} from "quasar";
import { useQuasar } from "quasar"
import { computed } from "vue"
import { useStore } from "vuex"
import { useI18n } from "vue-i18n"
import type { Offer } from "src/store/model"
import DeleteBtn from "./DeleteBtn.vue"
import { useRouter } from "vue-router"

 
const props = defineProps<{
  code: string
  offer: DeepPartial<Offer>
  to?: string
}>()

const store = useStore()
const $q = useQuasar()
const { t } = useI18n()
const router = useRouter()

const deleteOffer = async () => {
  await store.dispatch('offers/delete', {
    id: props.offer.id,
    group: props.code
  })
  $q.notify({
    message: t('offerDeleted'),
    type: 'positive'
  })
  if (props.to) {
    router.push(props.to)
  }
}
const name = computed(() => props.offer.attributes?.name)

</script>