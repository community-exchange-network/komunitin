<template>
  <div 
    class="text-caption text-weight-medium pill" 
    :class="`bg-${bg} text-${text}`"
  ><slot /></div>
</template>
<script setup lang="ts">
import { computed } from 'vue';

const colors = {
  "light-blue": { text: 'light-blue-10', bg: 'light-blue-1' },
  "orange": { text: 'orange-10', bg: 'orange-1' },
  "teal": { text: 'teal-10', bg: 'teal-1' },
  "green": { text: 'green-10', bg: 'green-1' },
  "red": { text: 'red-10', bg: 'red-1' },
  "deep-orange": { text: 'deep-orange-10', bg: 'deep-orange-1' },
  "grey": { text: 'grey-10', bg: 'grey-1' },
  "blue-grey": { text: 'blue-grey-10', bg: 'blue-grey-1' },
}

const props = defineProps<{
  color: keyof typeof colors,
}>();

const text = computed(() => colors[props.color].text);
const bg = computed(() => colors[props.color].bg);

</script>
<style lang="scss" scoped>
.pill {
  padding: 4px 12px;
  line-height: 16px;
  border-radius: 16px;
  letter-spacing: 0.06em;
}
</style>