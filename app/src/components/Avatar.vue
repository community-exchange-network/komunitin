<template>
  <q-avatar
    :size="size"
    text-color="white"
    :style="`background-color: ${bgColor};`"
  >
    <img 
      v-if="imgSrc" 
      :src="imgSrc"
      style="object-fit: cover;"
    >
    <template v-else>
      {{ initial }}
    </template>
  </q-avatar>
</template>
<script setup lang="ts">
import { colors, getCssVar } from "quasar";
import { computed } from "vue";

const props = withDefaults(defineProps<{
  imgSrc?: string | null,
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
  return getCssVar('secondary');
  const seed = Math.abs(props.text.split("").reduce(
    (hash: number, b: string) => (((hash << 5) - hash) + b.charCodeAt(0)*997), 0)); 
  const rgb = colors.hsvToRgb({h: seed % 360, s: 80, v:80});
  return colors.rgbToHex(rgb);
})


</script>