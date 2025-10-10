<template>
  <div class="relative-position">
    <q-input
      v-model="iconFilter"
      :label="$t('searchIcon')"
      outlined
      debounce="300"
    >
      <template #append>
        <q-icon name="search" />
      </template>
    </q-input>
    <icon-picker
      v-if="!init"
      v-model="icon"
      class="q-mt-md text-onsurface-m"
      size="lg"
      icon-set="material-icons"
      tooltips
      style="height: 220px;"
      :filter="iconFilter"
    />
    <q-space 
      v-else
      class="q-mt-md"
      style="height: 220px;"
    />
    <q-inner-loading
      :showing="init"
      :label="$t('loadingIcons')"
      size="xl"
    />
  </div>
</template>
<script async setup lang="ts">
/**
 * QIconPicker is a Quasar extension component that allows the user to select an icon from a list of icons. 
 * This component is a wrapper around QIconPicker so it shows a loading spinner while the icons 
 * are being loaded.
 */
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'

const props = defineProps<{
  modelValue?: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: string|undefined): void
}>()

const icon = computed({
  get: () => props.modelValue ?? undefined,
  set: (value: string|undefined) => emit('update:modelValue', value)
})

const iconFilter = ref('')
const init = ref(true)
onMounted(() => {
  // Run code after next paint.
  setTimeout(() => {
    init.value = false
  }, 10)
})

const IconPicker = defineAsyncComponent(async () => {
  // Run code after next paint.
  await new Promise(resolve => setTimeout(resolve, 10))
  // Preload icons as @quasar/quasar-ui-qiconpicker uses require() which is not supported by Vite.
  await import('@quasar/quasar-ui-qiconpicker/dist/icon-set/material-icons.umd.js')
  const { QIconPicker } = await import('@quasar/quasar-ui-qiconpicker')
  return QIconPicker
})
</script>