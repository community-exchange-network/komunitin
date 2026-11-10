<template>
  <InactiveBanner
    ref="inactiveBanner"
    :class="className"
  />
  <NotificationsBanner
    v-if="!(inactiveBanner?.show)"
    ref="notificationsBanner"
    :class="className"
  />
</template>
<script setup lang="ts">
import { ref } from "vue"
import NotificationsBanner from "../components/NotificationsBanner.vue"
import InactiveBanner from "../components/InactiveBanner.vue"

const inactiveBanner = ref<InstanceType<typeof InactiveBanner>>()
const notificationsBanner = ref<InstanceType<typeof NotificationsBanner>>()
const className = "bg-surface-container-high text-on-surface-medium q-pt-lg"

</script>