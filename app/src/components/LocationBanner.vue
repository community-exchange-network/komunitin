<template>
  <q-banner
    v-if="show"
    class="text-onsurface-m banner"
  >
    <template #avatar>
      <q-icon name="location_on" />
    </template>

    {{ isDenied ? $t("deniedLocationText") : $t("enableLocationText") }}
    <template #action>
      <q-btn
        flat
        color="primary"
        :label="$t('dismiss')"
        @click="dismiss"
      />
      <q-btn
        v-if="!isDenied"
        flat
        color="primary"
        :label="$t('enableLocation')"
        @click="enable"
      />
    </template>
  </q-banner>
</template>
<script setup lang="ts">
import KError, { KErrorCode } from "src/KError";
import { ref, computed, onBeforeMount } from "vue";
import { useStore } from "vuex";
import { useUIStore } from "src/stores/ui";

const ready = ref(false)

const store = useStore()
const uiStore = useUIStore()
const dismissed = computed(() => uiStore.locationBannerDismissed)

const permission = ref<"granted" | "denied" | "prompt" | undefined>(undefined)

const isAuthorized = computed(() => permission.value == 'granted')
const isDenied = computed(() => permission.value == 'denied')

// Dont show the banner if we dont know if we have permission (we may have so but the
// browser don't support permission api) but we at least have a saved location.
const show = computed(() => ready.value && !dismissed.value && !isAuthorized.value && !(permission.value === undefined && store.state.location !== undefined))


const dismiss = () => uiStore.locationBannerDismissed = true

const enable = async () => {
  try {
    await store.dispatch("locate");
    permission.value = 'granted'
  } catch (error) {
    if (error instanceof KError) {
      if (error.code == KErrorCode.PositionPermisionDenied) {
        permission.value = 'denied'
        return
      }
    }
    // This is unexpected error: timeout, position unavailable, etc
    throw error
  }
}

// Initialization.
onBeforeMount(async () => {
  // Check for geolocation permission (if browser supports it).
  const permissionStatus = await navigator?.permissions?.query({ name: 'geolocation' })
  permission.value = permissionStatus?.state

  if (permission.value == 'granted') {
    await store.dispatch("locate");
  }
  ready.value = true
})

defineExpose({show})

</script>
<style lang="scss" scoped>
.banner{
  border-bottom: solid 1px $separator-color;
}
</style>