<template>
  <nav class="q-pa-sm text-on-surface-medium">
    <q-item
      v-for="item in items"
      :key="item.id"
      :to="`${indexPath}/${item.id}`"
      :active="isIndex ? wide && item.id === 'signup' : null"
      active-class="bg-active text-primary-variant"
      class="rounded-borders text-label-large q-pr-sm"
    >
      <q-item-section side>
        <q-icon :name="item.icon" size="20px" color="icon" />
      </q-item-section>
      <q-item-section>
        {{ item.label }}
      </q-item-section>
      <q-item-section v-if="!wide" side>
        <q-icon name="chevron_right" size="20px" color="icon"/>
      </q-item-section>
    </q-item>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getTopupSettingsNav } from '@/features/topup/routes'

defineProps<{
  indexPath: string
  wide: boolean
  isIndex: boolean
}>()

const { t } = useI18n()

const items = computed(() => [
  { id: 'signup', label: t('signupSettings'), icon: 'person_add' },
  { id: 'marketplace', label: t('marketplace'), icon: 'storefront' },
  { id: 'emails', label: t('emails'), icon: 'mail' },
  { id: 'external-transfers', label: t('externalPayments'), icon: 'public' },
  { id: 'permissions', label: t('accountPermissions'), icon: 'key' },
  { id: 'account-rules', label: t('accountPreferences'), icon: 'tune' },
  ...getTopupSettingsNav(t),
  
  { id: 'status', label: t('groupStatus'), icon: 'power_settings_new' }
])
</script>

