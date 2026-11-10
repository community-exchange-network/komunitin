<template>
  <span ref="element" class="fittext">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'

/**
 * The <fit-text> component is a <span> that adjusts its fontSize
 * so that it fits the parent element width.
 * @displayName Fit Text
 */
const props = defineProps<{ update?: boolean }>()
const element = ref<HTMLElement>()
let observer: ResizeObserver | undefined
let frame = 0

/**
 * Sets the font-size style property of this element so that it fits
 * the parent container width.
 */
function fit() {
  // Initializations get this element and its parent.
  const text = element.value
  const parent = text?.parentElement
  // Check that the element is in the dom and has measurable width.
  if (text && parent && parent.clientWidth > 0 && text.clientWidth > 0) {
    const parentWidth = parent.clientWidth
    let ratio = parentWidth / text.clientWidth
    // We loop until 0.1% accuracy or 5 iterations.
    let counter = 0
    while (Math.abs(ratio - 1) > 0.001 && counter < 5) {
      // Multiply the current fontSize by the relation of widths
      // between this element and the parent one.
      const currentSize = parseFloat(getComputedStyle(text).fontSize)
      const fontSize = `${currentSize * ratio}px`
      if (text.style.fontSize === fontSize) break
      text.style.fontSize = fontSize
      // Prepare next iteration.
      ratio = parentWidth / text.clientWidth
      counter++
    }
  }
}

onMounted(() => {
  // Call the fit function after the children has been rendered too.
  void nextTick(fit)

  // Call it also after fonts have been loaded. We don't check this
  // condition before calling since this way the first call already
  // does some adjustment and therefore the text does not do a big
  // jump once fonts are loaded.
  void document.fonts?.ready.then(fit)

  // Update on resize.
  const parent = element.value?.parentElement
  if (props.update && parent && typeof ResizeObserver !== 'undefined') {
    let width = parent.clientWidth
    observer = new ResizeObserver(() => {
      if (parent.clientWidth !== width) {
        width = parent.clientWidth
        // Ignore height changes caused by fitting and write outside observer delivery.
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(fit)
      }
    })
    observer.observe(parent)
  }
})

onUpdated(() => {
  // Call the fit function after the children has been rendered too.
  void nextTick(fit)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
</script>

<style lang="scss" scoped>
span.fittext {
  // Make the span have clientWidth.
  display: inline-block;
  // Forbid word wrapping.
  white-space: nowrap;
}
</style>
