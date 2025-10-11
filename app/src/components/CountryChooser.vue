<template>
  <q-select 
    v-model="country"
    :options="countryList" 
    emit-value
    map-options
  />
</template>
<script setup lang="ts">
import type { LocaleData } from 'i18n-iso-countries';
import { registerLocale, getNames } from 'i18n-iso-countries';
import { useLocale } from '../boot/i18n';
import { getLocaleDefinition } from '../i18n';
import { computed, onMounted, ref } from 'vue';

const props = defineProps<{
  modelValue: string | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const locale = useLocale()
const localeDefinition = getLocaleDefinition(locale.value)
const countryList = ref<{value: string, label: string}[]>([])
const country = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

onMounted(async () => {
  const list = await localeDefinition.loadCountries() as LocaleData
  registerLocale(list)
  const names = getNames(list.locale)
  countryList.value = Object.entries(names).map(([value, label]) => ({value, label}))
})

</script>