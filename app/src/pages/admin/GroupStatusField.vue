<template>
  <div v-if="isPending">
    {{ t('groupStatusPendingText') }}
  </div>
  <div v-if="isActive">
    {{ t('groupStatusActiveText') }}
  </div>
  <div v-if="isDisabled">
    {{ t('groupStatusDisabledText') }}
  </div>
  <confirm-btn
    v-if="isActive"
    icon="delete"
    outline
    :label="t('disableGroup')"
    color="negative"
    :loading="loading"
    @confirm="disable"
  >
    {{ t('disableGroupConfirmText', { 
      code: group.attributes.code, 
      name: group.attributes.name,
      members: group.relationships.members.meta?.count ?? "0"
      }) 
    }}
  </confirm-btn>
  <confirm-btn
    v-if="isDisabled"
    icon="check_circle"
    :label="t('enableGroup')"
    color="positive"
    :loading="loading"
    @confirm="enable"
  >
    {{ t('enableGroupConfirmText', { 
      code: group.attributes.code, 
      group: group.attributes.name
      }) 
    }}
  </confirm-btn>

</template>
<script setup lang="ts">
import type { Group } from 'src/store/model';
import { useI18n } from 'vue-i18n';
import ConfirmBtn from '../../components/ConfirmBtn.vue';
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { useQuasar } from 'quasar';
const props = defineProps<{
  group: Group
}>()

const { t } = useI18n()

const currentStatus = computed(() => props.group.attributes.status)

const isActive = computed(() => currentStatus.value === 'active') 
const isDisabled = computed(() => currentStatus.value === 'disabled')
const isPending = computed(() => currentStatus.value === 'pending')

const disable = () => setGroupStatus('disabled')
const enable = () => setGroupStatus('active')

const store = useStore()

const loading = ref(false)
const q = useQuasar()
const setGroupStatus = async (status: 'active' | 'disabled') => {
  try {
    loading.value = true
    await store.dispatch('groups/update', {
      group: props.group.attributes.code,
      resource: {
        type: 'groups',
        attributes: {
          status
        }
      }
    })
    await store.dispatch('currencies/load', {
      group: props.group.attributes.code
    })
    q.notify({
      type: 'positive',
      message: t('groupStatusUpdated')
    })
  } finally {
    loading.value = false
  }
} 

</script>
