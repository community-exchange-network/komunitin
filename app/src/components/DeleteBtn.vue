<template>
  <confirm-btn
    icon="delete"
    :label="t('delete')"
    round
    flat
    color="negative"
    :btn-color="props.color"
  >
    <div class="column q-gutter-md">
      <div>
        <slot />
      </div>
      <div>
        {{ t('cantBeUndone') }}
      </div>
    </div>
  </confirm-btn>
</template>
<script setup lang="ts">
import ConfirmBtn from './ConfirmBtn.vue';

import { useI18n } from 'vue-i18n';

const props = defineProps<{
  color?: string
}>()

const { t } = useI18n();
</script>