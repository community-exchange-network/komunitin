<template>
  <div class="q-gutter-y-lg">
    <div>
      <h1 class="text-title-medium q-ma-none">
        {{ $t('groupStatus') }}
      </h1>
      <div class="text-on-surface-medium">
        {{ $t('groupStatusText') }}
      </div>
    </div>
    <group-status-field
      :group="group"
    />
  </div>
</template>

<script setup lang="ts">
import GroupStatusField from './GroupStatusField.vue'
import type { CommunitySettingsContext } from '@/composables/useCommunitySettings'

const { settingsContext } = defineProps<{ settingsContext: CommunitySettingsContext }>()
const { group } = settingsContext
</script>
