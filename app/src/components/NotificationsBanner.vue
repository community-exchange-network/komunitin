<template>
  <q-banner
    v-if="show"
    class="text-onsurface-m banner"
  >
    <template #avatar>
      <q-icon name="notifications" />
    </template>

    {{ text }}
    <template #action>
      <q-btn
        flat
        color="primary"
        :label="t('dismiss')"
        @click="dismiss"
      />
      <q-btn
        v-if="isCompatible && !isDenied"
        flat
        color="primary"
        :label="t('enableNotifications')"
        @click="subscribe"
      />
    </template>
  </q-banner>
</template>
<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useStore } from "vuex";

const {t} = useI18n()

const store = useStore()
const dismissed = computed(() => store.state.ui.notificationsBannerDismissed)
const isLoggedIn = computed(() => store.getters.isLoggedIn)
const hasMember = computed(() => !!store.getters.myMember)
const isCompatible = computed(() => (typeof window !== 'undefined' && 'Notification' in window))
const permission = ref(isCompatible.value ? Notification.permission : 'denied')
const isAuthorized = computed(() => permission.value == 'granted')
const isDenied = computed(() => permission.value == 'denied')
const text = computed(() => {
  if (isCompatible.value) {
    return isDenied.value ? t("deniedNotificationsText") : t("enableNotificationsText")
  } else {
    return t("incompatibleNotificationsText")
  }
})

const show = computed(() => isLoggedIn.value && hasMember.value && !isAuthorized.value && !dismissed.value)

const dismiss = () => store.commit("notificationsBannerDismissed", true)
const subscribe = async () => {
  if (!isCompatible.value) return;
  permission.value = await Notification.requestPermission()
  if (permission.value == 'granted') {
    await store.dispatch("subscribe");
  }
}

defineExpose({show})

</script>
<style lang="scss" scoped>
.banner {
  border-bottom: solid 1px $separator-color;
}
</style>