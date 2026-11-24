<template>
  <div class="q-gutter-y-lg">
    <div>
      <h1 class="text-title-medium q-ma-none">
        {{ $t('marketplace') }}
      </h1>
      <div class="text-on-surface-medium">
        {{ $t('marketplaceText') }}
      </div>
    </div>
    <div class="text-label-medium-uppercase text-on-surface-medium">
      {{ $t('categories') }}
    </div>
    <div class="text-on-surface-medium">
      {{ $t('categoriesText') }}
    </div>
    <categories-field
      v-if="categories"
      :categories="categories"
      @update:category="update"
      @create:category="create"
      @delete:category="remove"
    />
    <q-inner-loading v-else :showing="loading" />
  </div>
</template>

<script setup lang="ts">
import type { DeepPartial } from 'quasar'
import { useResource, useResources } from '@/composables/useResources'
import type { Category, ResourceIdentifierObject } from '@/store/model'
import CategoriesField from './CategoriesField.vue'
import type { CommunitySettingsContext } from '@/composables/useCommunitySettings'

const { settingsContext } = defineProps<{ settingsContext: CommunitySettingsContext }>()
const { code, save } = settingsContext
const { resources: categories, load, loading } = useResources<Category>('categories', { group: code.value })
const { update: updateCategory, create: createCategory, remove: removeCategory } = useResource<Category>('categories', { group: code.value }, { immediate: false })

const update = (category: DeepPartial<Category> & ResourceIdentifierObject) => {
  return save(() => updateCategory(category))
}
const create = async (category: DeepPartial<Category>) => {
  await save(() => createCategory(category))
  await load()
}
const remove = async (category: Category) => {
  await save(() => removeCategory(category.id))
  await load()
}
</script>
