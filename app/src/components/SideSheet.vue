<template>
  <div>
    <q-scroll-observer @scroll="scrollOffset = $event.position.top" />
    <q-drawer
      v-bind="$attrs"
      v-model="model"
      side="right"
    >
      <div class="side-sheet full-height bg-surface">
        <div class="row items-center no-wrap q-px-md q-py-sm text-on-surface-medium">
          <div class="col text-title-medium">
            {{ title }}
          </div>
          <q-btn
            flat
            round
            dense
            icon="close"
            color="icon"
            :title="$t('close')"
            @click="model = false"
          />
        </div>
        <slot />
      </div>
    </q-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Fine tuning for right side sheets. It adjusts the top padding and border radius 
 * based on the page scroll to keep the top padding consistent with the main content.
 */
defineOptions({ inheritAttrs: false })

defineProps<{
  title: string
}>()

const model = defineModel<boolean>({ required: true })
const scrollOffset = ref(0)
// The top gutter scrolls away with the page before the sheet stays pinned.
const topInset = computed(() => `${Math.max(0, 16 - scrollOffset.value)}px`)
</script>

<style lang="scss" scoped>
:deep(.q-drawer) {
  // QDrawer's white background would otherwise fill the gutters and rounded corners.
  background: transparent;
}

:deep(.q-drawer--standard) {
  .q-drawer__content {
    padding: v-bind(topInset) 16px 16px 0;
  }

  .side-sheet {
    border-radius: $generic-border-radius;
  }
}

:deep(.q-drawer--mobile) {
  .side-sheet {
    border-radius: $generic-border-radius 0 0 $generic-border-radius;
  }
}
</style>
