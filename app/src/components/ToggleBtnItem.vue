<template>
  <q-item style="padding-left: 12px; padding-right: 12px;" :disable="props.disable">
    <q-item-section>
      <q-item-label>{{ label }}</q-item-label>
      <q-item-label caption>{{ caption }}</q-item-label>
      <q-btn-toggle v-model="model" class="q-mt-sm" spread unelevated color="white" text-color="primary" :options="btnOptions" :disable="props.disable" />
    </q-item-section>
  </q-item>
</template>
<script setup lang="ts">
import { computed } from 'vue';

const model = defineModel<string>()
const props = defineProps<{
  label: string
  caption?: string
  options: {label: string, value: string, off?: boolean}[]
  disable?: boolean
}>()

const btnOptions = computed(() => {
  return props.options.map((option, index) => ({
    label: option.label,
    value: option.value,
    style: [
      'border: solid 1px;',
      option.off ? 'border-color: #9e9e9e' : 'border-color: var(--q-primary);',
      index > 0 ? 'border-left: none;' : '',
      index < props.options.length - 1 ? 'border-right: none;' : '',
      option.off && model.value === option.value ? 'background-color: #9e9e9e !important; color: white !important;' : '',
      option.off && model.value !== option.value ? 'color: #9e9e9e !important;' : '',
    ]

  }))
})
</script>