<template>
  <div>
    <div
      class="read-more-content overflow-hidden"
      :style="{ maxHeight: `${isOpen ? contentHeight : collapsedHeight}px` }"
    >
      <div ref="contentRef" class="overflow-hidden">
        <slot />
      </div>
    </div>
    <div v-if="canToggle" class="row q-mt-sm">
      <button
        type="button"
        class="read-more-toggle row items-center text-body2 text-weight-regular text-primary bg-transparent no-border q-px-none q-py-xs cursor-pointer"
        style="font-family: inherit; text-underline-offset: 3px;"
        :aria-expanded="isOpen"
        @click="isOpen = !isOpen"
      >
        <span>{{ isOpen ? $t('readLess') : $t('readMore') }}</span>
        <q-icon
          :name="isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
          size="20px"
          class="q-ml-xs"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useElementSize } from '@vueuse/core'

const props = defineProps<{
  /** Maximum content height in pixels while collapsed. */
  collapsedHeight: number
}>()

const isOpen = shallowRef(false)
const contentRef = useTemplateRef<HTMLElement>('contentRef')
const { height: contentHeight } = useElementSize(contentRef)
const canToggle = computed(() => contentHeight.value > props.collapsedHeight)
</script>

<style scoped>
.read-more-content {
  transition: max-height .3s ease;
}

.read-more-toggle:hover > span,
.read-more-toggle:focus-visible > span {
  text-decoration: underline;
}
</style>
