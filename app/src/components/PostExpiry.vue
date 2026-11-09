<template>
  <div class="text-caption row items-center" :class="expiryClass">
    <q-icon name="event" size="18px" class="q-mr-xs" />
    <time :datetime="expires">
      {{ $t('expiresAt', { date: $formatDate(expires) }) }}
    </time>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  expires: string
}>()

const expiryClass = computed(() => {
  const remaining = new Date(props.expires).getTime() - Date.now()
  return remaining <= 0 ? 'text-negative'
    : remaining <= 7 * 24 * 60 * 60 * 1000 ? 'text-deep-orange-10 text-weight-medium'
    : 'text-on-surface-variant'
})
</script>
