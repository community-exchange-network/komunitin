<template>
  <q-page-sticky
    :position="q.screen.gt.sm ? 'bottom' : 'bottom-right'"
    :offset="q.screen.gt.sm ? [24,24]: [16,16]"
  >
    <q-btn 
      v-bind="$attrs" 
      no-caps
      fab
    />
  </q-page-sticky>
</template>
<script setup lang="ts">
import { useQuasar } from 'quasar'

defineOptions({
  inheritAttrs: false,
})

const q = useQuasar();

</script>