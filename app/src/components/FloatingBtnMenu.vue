<template>
  <q-page-sticky
    :position="q.screen.gt.sm ? 'bottom' : 'bottom-right'"
    :offset="q.screen.gt.sm ? [24,24]: [16,16]"
  >
    <q-fab 
      icon="add" 
      color="primary"
      v-bind="$attrs"
      direction="up"
      :label="label"
      :vertical-actions-align="q.screen.gt.sm ? 'center': 'right'"
      v-model="expanded"
      :hide-label="expanded"
    >
      <q-fab-action
        v-for="action in actions" 
        :key="action.label" 
        :icon="action.icon" 
        :label="action.label" 
        :color="action.color"
        :text-color="action.textColor"
        :disable="action.disable"
        :to="action.to"
        class="q-pa-md"
        style="margin-right: 0"
      />
    </q-fab>
  </q-page-sticky>
</template>
<script setup lang="ts">
import { useQuasar } from 'quasar'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({
  inheritAttrs: false,
})

export interface FABAction {
  icon: string
  label: string
  color: string
  to: string
  textColor?: string
  disable?: boolean
}

const props = defineProps<{
  actions: FABAction[]
  label?: string
}>()

const q = useQuasar()
const { t } = useI18n()

const label = props.label ?? t('create')
const expanded = ref(false)

</script>
