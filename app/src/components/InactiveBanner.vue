<template>
  <q-banner
    v-if="show"
    class="text-onsurface-m banner"
  >
    <template #avatar>
      <q-icon name="verified_user" />
    </template>
    {{ bannerText }}
    <template #action>
      <q-btn
        flat
        color="primary"
        :label="$t('dismiss')"
        @click="dismissInactive"
      />
    </template>
  </q-banner>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useStore } from "vuex";
import { useI18n } from "vue-i18n";

const store = useStore()
const route = useRoute()
const { t } = useI18n()

const dismissed = computed(() => store.state.ui.inactiveBannerDismissed)
const dismissInactive = () => store.commit("inactiveBannerDismissed", true)
const isSignupMemberPage = computed(() => route.name === "SignupMember")

const state = computed(() => store.getters.myMember?.attributes.state)

const isInactiveState = computed(() => ["pending", "disabled", "suspended"].includes(state.value))
const show = computed(() => !dismissed.value && store.getters.isLoggedIn && isInactiveState.value && !isSignupMemberPage.value)

const bannerText = computed(() => {
  if (state.value === "pending") {
    return t("pendingAccountBannerText")
  } else if (state.value === "disabled") {
    return t("disabledAccountBannerText")
  } else if (state.value === "suspended") {
    return t("suspendedAccountBannerText")
  }
  return ""
})
  

defineExpose({show})

</script>
