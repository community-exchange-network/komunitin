<template>
  <q-avatar
    :size="size"
    text-color="white"
    :style="`background-color: ${bgColor};`"
  >
    <img 
      v-if="imgSrc" 
      :src="imgSrc?.url"
      style="object-fit: cover;"
    >
    <template v-else>
      {{ initial }}
    </template>
  </q-avatar>
</template>
<script setup lang="ts">
import { colors } from "quasar";
import { computed } from "vue";
import type { ImageObject } from "src/store/model";

const props = withDefaults(defineProps<{
  imgSrc?: ImageObject | null,
  text: string,
  size?: string
}>(), {
  imgSrc: null,
  size: "40px"
});

const initial = computed(() => props.text.substring(0,1).toUpperCase());
const bgColor = computed(() => {
  if (props.imgSrc) {
    return "#FFF";
  }
  const seed = Math.abs(props.text.split("").reduce(
    (hash: number, b: string) => (((hash << 5) - hash) + b.charCodeAt(0)*997), 0)); 
  const rgb = colors.hsvToRgb({h: seed % 360, s: 80, v:80});
  return colors.rgbToHex(rgb);
})


</script>
