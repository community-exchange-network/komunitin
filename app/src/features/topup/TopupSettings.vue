<template>
  <page-header 
    :title="t('topupSettings')" 
    :back="`/groups/${props.code}/admin/settings`"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 q-mb-xl"
    >
      <topup-settings-form 
        v-if="ready"
        :topup-settings="topupSettings"
        :currency="currency"
        :updating-topup-settings="updatingTopupSettings"
        @update:topup-settings="updateTopupSettings"
      />
      <save-changes
        ref="changes"
        class="q-mt-lg"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import SaveChanges from 'src/components/SaveChanges.vue';
import PageHeader from 'src/layouts/PageHeader.vue';
import TopupSettingsForm from './TopupSettingsForm.vue';

import type { DeepPartial } from 'quasar';
import type { TopupSettings } from 'src/features/topup/model';
import type { Currency, ResourceIdentifierObject } from 'src/store/model';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'vuex';
import { useResource } from '../../composables/useResources';

const props = defineProps<{
  code: string
}>()

const store = useStore()
const { t } = useI18n()

const {resource: currency} = useResource<Currency>('currencies', {
  group: props.code,
})

const {resource: topupSettings} = useResource<TopupSettings>('topup-settings', {
  group: props.code,
})

const ready = computed(() => {
  return currency.value !== null && topupSettings.value !== null
})

const changes = ref<typeof SaveChanges>()

const updatingTopupSettings = ref(false)
const updateTopupSettings = async (settings: DeepPartial<TopupSettings> & ResourceIdentifierObject) => {
  try {
    updatingTopupSettings.value = true
    await changes.value.save(async () => {
      await store.dispatch('topup-settings/update', {
        id: topupSettings.value.id,
        group: props.code,
        resource: settings
      })
    })
  } finally {
    updatingTopupSettings.value = false
  }
}

</script>
