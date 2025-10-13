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
    <q-icon-picker
      v-model="icon"
      class="q-mt-md text-onsurface-m"
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
import { icons } from '@quasar/quasar-ui-qiconpicker/dist/icon-set/material-icons.umd.js'
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

</script>
<style src="@quasar/quasar-ui-qiconpicker/dist/index.css"></style>