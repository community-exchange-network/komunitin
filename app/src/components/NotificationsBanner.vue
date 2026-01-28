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
        v-if="dismissable"
        flat
        color="primary"
        :label="t('dismiss')"
        @click="dismiss"
      />
      <q-btn
        v-if="isPushCompatible && !isPermissionDenied"
        flat
        color="primary"
        :label="t('enableNotifications')"
        @click="enablePushNotifications"
      />
      <q-btn
        v-if="isPushCompatible && isPermissionDenied"
        flat
        color="primary"
        :label="t('notificationsPermissionHelp')"
        :href="helpUrl"
        target="_blank"
        rel="noopener"
      />
    </template>
  </q-banner>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useStore } from "vuex";
import { getNotificationPermission, isWebPushCompatible, requestNotificationPermission } from "../plugins/Notifications";
import { config } from "../utils/config";

const props = withDefaults(defineProps<{
  dismissable?: boolean
}>(), {
  dismissable: true,
})

const {t} = useI18n()

const store = useStore()

const dismissed = computed(() => props.dismissable && store.state.ui.notificationsBannerDismissed)

const isLoggedIn = computed(() => store.getters.isLoggedIn)
const hasMember = computed(() => !!store.getters.myMember)

// Permission is not reactive by itself; keep a local ref.
const permission = ref<NotificationPermission>(getNotificationPermission())

const isPushCompatible = computed(() => isWebPushCompatible())

const isPermissionGranted = computed(() => permission.value === 'granted')
const isPermissionDenied = computed(() => permission.value === 'denied')

const isSubscribed = computed(() => store.getters.isSubscribed)

const isPushEnabled = computed(
  () => isPushCompatible.value && isPermissionGranted.value && isSubscribed.value,
)

const requestPermission = async () => {
  permission.value = await requestNotificationPermission()
  return permission.value
}

const enablePushNotifications = async () => {
  if (!isPushCompatible.value) return

  if (permission.value !== 'granted') {
    await requestPermission()
  }
  
  if (permission.value === 'granted') {
    await store.dispatch('subscribe')
  }
}

const text = computed(() => {
  if (!isPushCompatible.value) {
    return t("incompatibleNotificationsText")
  } else if (isPermissionDenied.value) {
    return t("deniedNotificationsText")
  } else {
    return t("enableNotificationsText")
  }
})

const helpUrl = `${config.DOCS_URL}/features/notifications/enable-push-notifications`

const show = computed(() => {
  return isLoggedIn.value && hasMember.value && !isPushEnabled.value && !dismissed.value
})

const dismiss = () => store.commit("notificationsBannerDismissed", true)

defineExpose({show})

</script>
<style lang="scss" scoped>
.banner {
  border-bottom: solid 1px $separator-color;
}
</style>