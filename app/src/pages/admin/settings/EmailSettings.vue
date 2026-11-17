<template>
  <div class="q-gutter-y-lg">
    <div>
      <h1 class="text-title-medium q-ma-none">
        {{ $t('emails') }}
      </h1>
    </div>
    <toggle-item
      v-model="enableGroupEmail"
      @update:model-value="saveGroupSettings({ enableGroupEmail })"
      :label="$t('enableGroupEmail')"
      :hint="$t('enableGroupEmailHint')"
    />
    <toggle-btn-item
      v-model="defaultEmailFrequency"
      @update:model-value="saveGroupSettings({ defaultGroupEmailFrequency: defaultEmailFrequency })"
      :label="$t('defaultGroupEmailFrequency')"
      :caption="$t('defaultGroupEmailFrequencyHint')"
      :disable="!enableGroupEmail"
      :options="[
        { label: $t('weekly'), value: 'weekly' },
        { label: $t('monthly'), value: 'monthly' },
        { label: $t('never'), value: 'never', off: true }
      ]"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ToggleItem from '@/components/ToggleItem.vue'
import ToggleBtnItem from '@/components/ToggleBtnItem.vue'
import type { CommunitySettingsContext } from '@/composables/useCommunitySettings'

const { settingsContext } = defineProps<{ settingsContext: CommunitySettingsContext }>()
const { groupSettings, saveGroupSettings } = settingsContext
const enableGroupEmail = ref(groupSettings.value.attributes.enableGroupEmail ?? true)
const defaultEmailFrequency = ref(groupSettings.value.attributes.defaultGroupEmailFrequency ?? 'monthly')
</script>
