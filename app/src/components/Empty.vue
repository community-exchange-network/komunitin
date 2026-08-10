<template>
  <div class="column items-center justify-center text-center q-pa-lg">
    <img
      class="empty-img q-mb-lg"
      src="~assets/acorn-512.png"
      alt=""
    >
    <div class="text-h4 text-onsurface-m">
      {{ text || $t('nothingHere') }}
    </div>
    <slot />
  </div>
</template>
<script setup lang="ts">
defineProps<{
  text?: string
}>()
</script>
<style scoped>
.empty-img {
  width: min(60vw, 256px);
  opacity: 75%;
}
</style>
