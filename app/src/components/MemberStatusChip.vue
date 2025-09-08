<template>
  <q-chip
    :color="color"
    text-color="white"
    :icon="icon"
    :label="label"
  />
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  status: string
}>()

const { t } = useI18n()
const color = computed(() => {
  switch (props.status) {
    case 'active':
      return 'positive'
    case 'disabled':
      return 'grey-6'
    case 'pending':
      return 'warning'
    case 'suspended':
      return 'negative'
    default:
      return 'grey-6'
  }
})

const icon = computed(() => {
  switch (props.status) {
    case 'active':
      return 'visibility'
    case 'disabled':
      return 'visibility_off'
    case 'pending':
      return 'hourglass_empty'
    case 'suspended':
      return 'pause'
    default:
      return 'help'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'active':
      return t('active')
    case 'disabled':
      return t('disabled')
    case 'pending':
      return t('pending')
    case 'suspended':
      return t('suspended')
    default:
      return props.status
  }
})

</script>