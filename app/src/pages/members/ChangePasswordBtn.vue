<script setup lang="ts">
import { shallowRef } from "vue"
import { useStore } from "vuex"
import { Notify } from "quasar"
import { useI18n } from "vue-i18n"
import DialogFormBtn from "../../components/DialogFormBtn.vue"
import PasswordField from "../../components/PasswordField.vue"
import { Auth } from "src/plugins/Auth"
import KError, { KErrorCode } from "src/KError"

const currentPassword = shallowRef("")
const newPassword = shallowRef("")
const passwordInvalid = shallowRef(false)

const store = useStore()
const { t } = useI18n()
const auth = new Auth()

const changePassword = async () => {
  passwordInvalid.value = false
  try {
    await auth.changeAuthenticatedPassword(
      currentPassword.value,
      newPassword.value,
      store.getters.accessToken
    )
    Notify.create({
      message: t("passwordChanged"),
      color: "positive",
      icon: "check"
    })
    currentPassword.value = ""
    newPassword.value = ""
  } catch (error) {
    if (error instanceof KError && error.code === KErrorCode.IncorrectCredentials) {
      passwordInvalid.value = true
    }
    throw error
  }
}
</script>

<template>
  <dialog-form-btn
    :label="$t('changePassword')"
    :text="$t('changePasswordText')"
    :valid="currentPassword.length > 0 && newPassword.length >= 8"
    :submit="changePassword"
  >
    <password-field
      v-model="currentPassword"
      :label="$t('oldPassword')"
      :hint="$t('oldPasswordHint')"
      class="q-mb-md"
      :error="passwordInvalid"
      @update:model-value="passwordInvalid = false"
    />
    <password-field
      v-model="newPassword"
      :label="$t('newPassword')"
      :hint="$t('newPasswordHint')"
    />
  </dialog-form-btn>
</template>
