<template>
  <div class="row q-gutter-xs">
    <pill-badge
      v-if="status === 'draft'"
      color="blue-grey"
    >
      {{ $t('draft') }}
    </pill-badge>
    <pill-badge
      v-else-if="status === 'hidden' || !memberActive"
      color="grey"
    >
      {{ $t('hidden') }}
    </pill-badge>
    <pill-badge
      v-if="expired"
      color="deep-orange"
    >
      {{ $t('expired') }}
    </pill-badge>
  </div>
</template>
<script setup lang="ts">
import type { PostStatus } from "src/store/model"
import PillBadge from "./PillBadge.vue"

defineProps<{
  status: PostStatus
  expired: boolean
  memberActive: boolean
}>()
</script>
