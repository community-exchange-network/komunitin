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
import { useAccountStatus } from "../composables/accountStatus";
import { useI18n } from "vue-i18n";

const store = useStore()
const route = useRoute()

const dismissed = computed(() => store.state.ui.inactiveBannerDismissed)
const dismissInactive = () => store.commit("inactiveBannerDismissed", true)
const isSignupMemberPage = computed(() => route.name === "SignupMember")

const state = computed(() => store.getters.myMember?.attributes.state)
const groupStatus = computed(() => store.getters.myMember?.group.attributes.status)

const isMemberDisabled = computed(() => ["pending", "disabled", "suspended"].includes(state.value))
const isGroupDisabled = computed(() => ["disabled"].includes(groupStatus.value))

const isInactiveState = computed(() => isMemberDisabled.value || isGroupDisabled.value)

const show = computed(() => !dismissed.value && store.getters.isLoggedIn && isInactiveState.value && !isSignupMemberPage.value)

const { text: memberStatusText } = useAccountStatus(() => state.value)
const { t } = useI18n()
const bannerText = computed(() => {
  if (isGroupDisabled.value) {
    return t("groupDisabledText")
  } else {
    return memberStatusText.value
  }
})

defineExpose({show})

</script>
