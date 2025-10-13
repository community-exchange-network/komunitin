<template>
  <q-select
    v-model="category"
    outlined
    :options="options"
    :label="label ?? $t('category')"
    :hint="hint"
  />
</template>
<script setup lang="ts">
import type { Category } from "src/store/model";
import { computed, watch } from "vue"
import { useStore } from "vuex";

const props = defineProps<{
  code: string,
  modelValue: Category | null
  label?: string,
  hint?: string
}>()
const emit = defineEmits<{
  (e: "update:modelValue", value: Category | null): void
}>()

const category = computed({
  get: () => props.modelValue ? {label: props.modelValue.attributes.name, value: props.modelValue.id} : null,
  set: (option: {label: string, value: string} | null) => emit("update:modelValue", option ? categories.value.find((c: Category) => c.id == option.value) : null)
})
const store = useStore()

watch(() => props.code, async () => {
  await store.dispatch('categories/loadList', {
    group: props.code
  })
}, {immediate: true})

const categories = computed(() => store.getters['categories/currentList'])
const options = computed(() => categories.value?.map((c: Category) => ({label: c.attributes.name, value: c.id})))

</script>