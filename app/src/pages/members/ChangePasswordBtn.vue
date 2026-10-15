<template>
  <dialog-form-btn
    no-wrap
    icon="key"
    :label="$t('changePassword')"
    :text="$t('changePasswordText')"
    :submit="sendResetLink"
  />
</template>

<script setup lang="ts">
import { useStore } from "vuex"
import { useI18n } from "vue-i18n"
import { Notify } from "quasar"
import { Auth } from "@/plugins/Auth"
import DialogFormBtn from "@/components/DialogFormBtn.vue"

const store = useStore()
const { t } = useI18n()
const auth = new Auth()

const sendResetLink = async () => {
  await auth.resetPassword(store.getters.myUser.attributes.email)
  Notify.create({
    message: t('resetLinkSentText'),
    color: 'positive',
    icon: 'mail'
  })
}
</script>
