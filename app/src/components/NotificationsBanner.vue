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
        :label="$t('dismiss')"
        @click="dismiss"
      />
      <q-btn
        v-if="isCompatible && !isDenied"
        flat
        color="primary"
        :label="$t('enableNotifications')"
        @click="subscribe"
      />
    </template>
  </q-banner>
</template>
<script setup lang="ts">
import { ref, computed, onBeforeMount } from "vue";
import { useI18n } from "vue-i18n";
import { useStore } from "vuex";
import { onMessage } from "firebase/messaging"
import { notifications } from "../plugins/Notifications"
import { notificationBuilder } from "../../src-pwa/notifications"
import { useRouter } from "vue-router";


const {t} = useI18n()

const ready = ref(false);

const store = useStore()
const dismissed = computed(() => store.state.ui.notificationsBannerDismissed)
const isLoggedIn = computed(() => store.getters.isLoggedIn)
const hasMember = computed(() => !!store.getters.myMember)
const isCompatible = computed(() => (window && 'Notification' in window))
const permission = ref(isCompatible.value && Notification.permission)
const isAuthorized = computed(() => permission.value == 'granted')
const isDenied = computed(() => permission.value == 'denied')
const text = computed(() => {
  if (isCompatible.value) {
    return isDenied.value ? t("deniedNotificationsText") : t("enableNotificationsText")
  } else {
    return t("incompatibleNotificationsText")
  }
})

const router = useRouter()

const show = computed(() => ready.value && isLoggedIn.value && hasMember.value && !isAuthorized.value && !dismissed.value)

const dismiss = () => store.commit("notificationsBannerDismissed", true)
const subscribe = async () => {
  permission.value = await Notification.requestPermission()
  if (permission.value == 'granted') {
    await store.dispatch("subscribe");
  }
}


// Initialization.
onBeforeMount(async () => {
  if (isLoggedIn.value && hasMember.value && isAuthorized.value) {
    await store.dispatch("subscribe");
  }
  ready.value = true

  // Set foreground message handler. We do it here instead of in the store or in the
  // Notifications plugin file because we need to access the full UI including the 
  // store and router.
  const notification  = notificationBuilder(store)
  onMessage(notifications.getMessaging(), (payload) => {
    notification(payload).then(({title, options}) => {
      const noti = new Notification(title, options)
      noti.addEventListener('click', function() {
        if (noti.data.url) {
          router.push(noti.data.url)
        }
      })
    }).catch((err) => {
      console.error("Error showing notification", err)
    })
  })

})

defineExpose({show})

</script>
<style lang="scss" scoped>
.banner {
  border-bottom: solid 1px $separator-color;
}
</style>