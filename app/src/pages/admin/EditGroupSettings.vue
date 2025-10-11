<template>
  <page-header
    :title="$t('groupSettings')" 
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 q-mb-xl"
    >
      <edit-group-settings-form 
        v-if="ready"

        :group-settings="groupSettings"
        :categories="categories"
        :currency="currency"
        :currency-settings="currencySettings"
        :trustlines="trustlines"

        :updating-group-settings="updatingGroupSettings"
        :updating-currency="updatingCurrency"
        :updating-currency-settings="updatingCurrencySettings"
        :updating-trustline="updatingTrustline"
        :updating-category="updatingCategory"

        @update:group-settings="updateGroupSettings"
        @update:currency="updateCurrency"
        @update:currency-settings="updateCurrencySettings"
        @update:trustline="updateTrustline"
        @create:trustline="createTrustline"
        @update:category="updateCategory"
        @create:category="createCategory"
        @delete:category="deleteCategory"
      />
      <save-changes
        ref="changes"
        class="q-mt-lg"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from 'src/layouts/PageHeader.vue';
import EditGroupSettingsForm from './EditGroupSettingsForm.vue';
import SaveChanges from 'src/components/SaveChanges.vue';

import type { Ref} from 'vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import type { DeepPartial } from 'quasar';
import type { Category, Currency, CurrencySettings, GroupSettings, ResourceIdentifierObject, ResourceObject, Trustline } from 'src/store/model';
import type { CreatePayload, DeletePayload, UpdatePayload } from 'src/store/resources';
import type { ExtendedTrustline } from './TrustlinesField.vue';

const props = defineProps<{
  code: string
}>()

const store = useStore()

const ready = ref(false)

const loadCategories = async () => {
  await store.dispatch('categories/loadList', {
    group: props.code
  })
}

const loadTrustlines = async () => {
  await store.dispatch('trustlines/loadList', {
    group: props.code,
    include: 'trusted'
  })
}

const load = async () => {
  await Promise.all([
    store.dispatch('groups/load', {
      id: props.code,
      include: 'settings'
    }),
    loadCategories(),
    store.dispatch('currencies/load', {
      id: props.code,
      include: "settings"
    }),
    loadTrustlines()
  ])
  // Load group resources for trusted currencies
  const trustlines = store.getters['trustlines/currentList']
  const codes = trustlines.map((t: ExtendedTrustline) => t.trusted.attributes.code)
  await store.dispatch('groups/loadList', {
    filter: {code: codes},
  })
  ready.value = true
}

// We need to build the objects directly from the store getters 
// (instead of "group.currency" etc) so they are reactive
const group = computed(() => store.getters['groups/current'])
const groupSettings = computed(() => store.getters['group-settings/one'](group.value.settings.id))
const categories = computed(() => store.getters['categories/currentList'])
const currency = computed(() => store.getters['currencies/one'](group.value.currency.id))
const currencySettings = computed(() => store.getters['currency-settings/one'](currency.value.settings.id))
const trustlines = computed(() => store.getters['trustlines/currentList'])


onMounted(load)
watch(() => props.code, load)

const changes = ref<typeof SaveChanges>()

const updatingGroupSettings = ref(false)
const updatingCurrency = ref(false)
const updatingCurrencySettings = ref(false)
const updatingTrustline = ref(false)
const updatingCategory = ref(false)

const updateResource = async <T extends ResourceObject>(action: string, payload: UpdatePayload<T> | CreatePayload<T> | DeletePayload, updating: Ref<boolean>) => {
  try {
    const fn = async () => await store.dispatch(action, payload)
    updating.value = true
    await changes.value?.save(fn)
  } finally {
    updating.value = false
  }
}

const updateGroupSettings = async (settings: DeepPartial<GroupSettings> & ResourceIdentifierObject) => {
  await updateResource<GroupSettings>('group-settings/update', {
    id: props.code,
    group: props.code,
    resource: settings
  }, updatingGroupSettings)
}

const updateCategory = async (category: DeepPartial<Category> & ResourceIdentifierObject) => {
  await updateResource('categories/update', {
    id: category.id,
    group: props.code,
    resource: category
  }, updatingCategory)
}

const createCategory = async (category: DeepPartial<Category>) => {
  await updateResource('categories/create', {
    group: props.code,
    resource: category
  }, updatingCategory)
  // update categories list
  try {
    updatingCategory.value = true
    await loadCategories()
  } finally {
    updatingCategory.value = false
  }
}

const deleteCategory = async (category: DeepPartial<Category>) => {
  await updateResource('categories/delete', {
    id: category.id,
    group: props.code
  }, updatingCategory)
  // update categories list
  try {
    updatingCategory.value = true
    await loadCategories()
  } finally {
    updatingCategory.value = false
  }
}

const updateCurrency = async (currency: DeepPartial<Currency> & ResourceIdentifierObject) =>  {
  await updateResource('currencies/update', {
    id: props.code,
    group: props.code,
    resource: {
      id: currency.id,
      type: 'currencies',
      attributes: {
        ...currency.attributes
      }
    }
  }, updatingCurrency)
}

const updateCurrencySettings = async (settings: DeepPartial<CurrencySettings> & ResourceIdentifierObject) => {
  await updateResource('currency-settings/update', {
    id: props.code,
    group: props.code,
    resource: settings
  }, updatingCurrencySettings)
}

const updateTrustline = async (trustline: DeepPartial<Trustline> & ResourceIdentifierObject) => {
  await updateResource('trustlines/update', {
    id: trustline.id,
    group: props.code,
    resource: {
      attributes: {
        limit: trustline.attributes?.limit
      }
    }
  }, updatingTrustline)
}

const createTrustline = async (trustline: DeepPartial<Trustline>) => {
  await updateResource('trustlines/create', {
    group: props.code,
    resource: trustline
  }, updatingTrustline)
  // update trustlines list
  try {
    updatingTrustline.value = true
    await loadTrustlines()
  } finally {
    updatingTrustline.value = false
  }
}
</script>