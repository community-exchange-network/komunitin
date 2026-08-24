<template>
  <need-page
    :code="code"
    :need-code="needCode"
    :title="$t('previewNeed')"
  >
    <template #after="{need}">
      <floating-btn 
        :label="$t('publishNeed')"
        color="kred"
        icon="publish"
        @click="publish(need)"
      />
    </template>
  </need-page>
</template>
<script setup lang="ts">
import { useQuasar } from 'quasar';
import FloatingBtn from '../../components/FloatingBtn.vue'
import { useI18n } from 'vue-i18n'
import NeedPage from './Need.vue'
import type { Member, Need } from '../../store/model'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'

 
const props = defineProps<{
  code: string,
  needCode: string
}>()

const $q = useQuasar()
const { t } = useI18n()
const store = useStore()
const router = useRouter()

type FullNeed = Need & { member: Member }

const publish = async (need: FullNeed) => {
  await store.dispatch('needs/update', {
    id: need.id,
    group: props.code,
    resource: {
      id: need.id,
      type: 'needs',
      attributes: {
        status: 'published'
      }
    }
  })

  $q.notify({
    message: t('needPublished'),
    type: 'positive'
  })

  router.push({
    path:`/groups/${props.code}/members/${need.member.attributes.code}`,
    hash: '#needs'
  })
}

</script>
