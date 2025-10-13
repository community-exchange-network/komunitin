<template>
  <q-select
    v-model="group"
    :options="options"
    :loading="loading"
    @virtual-scroll="loadNext"
  >
    <template #option="{itemProps, opt}">
      <group-header
        v-bind="itemProps"
        :group="opt"
      />
    </template>
    <template #selected>
      <group-header
        v-if="group"
        :group="group"
      />
    </template>
  </q-select>
</template>
<script setup lang="ts">
import { ref, computed, onMounted,  } from 'vue'
import { useStore } from 'vuex'

import GroupHeader from './GroupHeader.vue'
import type { Group } from 'src/store/model'

const props = defineProps<{
  modelValue?: Group|undefined
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Group|undefined): void
}>()

const loading = ref(false)

const group = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const store = useStore()
const loadGroups = async () => {
  loading.value = true
  try {
    await store.dispatch('groups/loadList', {
      include: 'currency',
      sort: 'name',
      cache: 1000*60*5
    })
  } finally {
    loading.value = false
  }
}

const loadNext = async () => {
  if (loading.value) return
  loading.value = true
  try {
    await store.dispatch('groups/loadNext', {
      cache: 1000*60*5,
    })
  } finally {
    loading.value = false
  } 
}

const options = computed(() => store.getters['groups/currentList'])
onMounted(async () => await loadGroups())

</script>