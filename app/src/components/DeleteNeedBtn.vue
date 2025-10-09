<template>
  <delete-btn @confirm="deleteNeed">
    <i18n-t
      keypath="deleteNeed"
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
import type { Need } from "src/store/model"
import { truncate}  from "../plugins/Clamp"
import DeleteBtn from "./DeleteBtn.vue"
import { useRouter } from "vue-router"

 
const props = defineProps<{
  code: string
  need: DeepPartial<Need>
  to?: string
}>()

const store = useStore()
const $q = useQuasar()
const { t } = useI18n()
const router = useRouter()

const deleteNeed = async () => {
  if (!props.need.attributes?.code) return
  await store.dispatch('needs/delete', {
    // TODO: Use the need id
    id: props.need.attributes.code,
    group: props.code
  })
  $q.notify({
    message: t('needDeleted'),
    type: 'positive'
  })
  if (props.to) {
    router.push(props.to)
  }
}
const name = computed(() => truncate(props.need.attributes?.content ?? "", 20))

</script>