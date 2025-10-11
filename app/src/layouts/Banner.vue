<template>
  <InactiveBanner
    ref="inactiveBanner"
  />
  <NotificationsBanner
    v-if="!(inactiveBanner?.show)"
    ref="notificationsBanner"
  />
</template>
<script setup lang="ts">
import { ref } from "vue"
import NotificationsBanner from "../components/NotificationsBanner.vue"
import InactiveBanner from "../components/InactiveBanner.vue"

const inactiveBanner = ref<InstanceType<typeof InactiveBanner>>()
const notificationsBanner = ref<InstanceType<typeof NotificationsBanner>>()

</script>
<style lang="scss" scoped>
  .banner {
    border-bottom: solid 1px $separator-color;
  }
</style>