<template>
  <div class="relative-position">
    <q-input
      v-model="iconFilter"
      :label="$t('searchIcon')"
      standout
      class="input-standout-light"
      debounce="300"
    >
      <template #append>
        <q-icon name="search" />
      </template>
    </q-input>
    <q-icon-picker
      v-model="icon"
      v-model:model-pagination="pagination"
      class="q-mt-md text-on-surface-medium"
      size="lg"
      :icons="icons"
      tooltips
      style="height: 220px;"
      :filter="iconFilter"
    />
  </div>
</template>
<script setup lang="ts">
/**
 * QIconPicker is a Quasar extension component that allows the user to select an icon from a list of icons. 
 */
import { computed, ref } from 'vue'
import iconNames from '@/assets/fonts/marketplace-icons.json'
import { QIconPicker } from '@quasar/quasar-ui-qiconpicker';

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
const icons = iconNames.map(name => ({ name }))
const pagination = ref({ page: 1, itemsPerPage: 60 })

</script>
<style src="@quasar/quasar-ui-qiconpicker/dist/index.css"></style>
