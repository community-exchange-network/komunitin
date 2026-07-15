<template>
  <q-banner
    v-if="confirmation"
    rounded
    class="text-white q-mb-xl q-py-lg banner"
  >
    <template #avatar>
      <q-icon name="check_circle"/>
    </template>
    {{ $t('emailConfirmed') }}
  </q-banner>
  <form
    class="column q-gutter-y-md"
    @submit.prevent="submit"
  >
    <q-input
      v-model="email"
      outlined
      dark
      type="email"
      :disable="!!confirmation"
      placeholder="example@example.com"
      :label="$t('email')"
      maxlength="255"
      :rules="[val => !v$.email.$invalid || $t('invalidEmail')]"
      lazy-rules
      autocomplete="username"
    >
      <template #append>
        <q-icon name="mail" />
      </template>
    </q-input>
    <password-field
      v-model="pass"
      dark
    />
    <div class="row q-mt-xs"
    :class="isSuperadmin ? 'justify-between' : 'justify-end'">
      <div v-if="isSuperadmin" class="text-warning text-weight-medium">Superadmin</div>
      <router-link
        to="/forgot-password" 
        class="text-onoutside-m link"
        @click.prevent="forgotPassword = true"
      >
        {{ $t('forgotPassword') }}
      </router-link>
    </div>
    <q-btn
      outline
      color="transparent"
      text-color="onoutside"
      :label="$t('logIn')"
      icon="account_circle"
      :disabled="loginDisabled"
      type="submit"
    />
  </form>
</template>

<script setup lang="ts">
import PasswordField from "../../components/PasswordField.vue"
import { computed, shallowRef } from "vue"
import { useVuelidate } from "@vuelidate/core"
import { required, email as emailv, minLength } from "@vuelidate/validators"
import KError, { KErrorCode } from "../../KError"
import { useQuasar } from "quasar"
import { useStore } from "vuex"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"
import { useRedirectQuery } from "../../composables/useRedirectQuery"
import { useEmailConfirmation } from "src/composables/useEmailConfirmation"

const { confirmation, clearConfirmation } = useEmailConfirmation()
const email = shallowRef(confirmation.value?.email ?? "")
const pass = shallowRef("")
const forgotPassword = shallowRef(false)

const v$ = useVuelidate({
  email: { required, emailv },
  pass: { required, minLength: minLength(4) }
}, { email, pass })

const $q = useQuasar()
const store = useStore()
const router = useRouter()
const { t } = useI18n()

const loginDisabled = computed(() => {
  return v$.value.$invalid
})

const redirect = useRedirectQuery()

const isSuperadmin = computed(() => {
  return redirect.value.startsWith("/superadmin")
})

const submit = async () => {
  v$.value.$touch()
  if (v$.value.$invalid) {
    // That should not happen, as the submit button should be disabled when the form is not validated.
    throw new KError(KErrorCode.IncorrectCredentials, "Incorrect email or password")
  }
  try {
    $q.loading.show({
      delay: 200
    })
    
    await store.dispatch("login", {
      email: email.value,
      password: pass.value,
      signup: confirmation.value?.signup
    })
    clearConfirmation()
  } finally {
    $q.loading.hide()
  }

  $q.notify({ type: "positive", message: t("sucessfulLogin", { name: email.value }) })
  await router.push(redirect.value)
}
</script>
<style scoped lang="scss">
  .banner {
    border: 1px solid rgba(255, 255, 255, 0.2);
    background-color: rgba(255, 255, 255, 0.1);
  }
</style>