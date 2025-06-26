<template>
  <form
    v-if="!emailSent"
    class="column q-gutter-y-md"
    @submit.prevent="submit"
  >
    <div class="text-h6 text-onoutside">
      {{ $t('resetPassword') }}
    </div>
    <div class="text-body text-onoutside">
      {{ $t('resetPasswordText') }}
    </div>
    <q-input
      v-model="email"
      outlined
      dark
      type="email"
      placeholder="example@example.com"
      :label="$t('email')"
      maxlength="255"
      :rules="[val => !v$.email.$invalid || $t('invalidEmail')]"
      lazy-rules
    >
      <template #append>
        <q-icon name="mail" />
      </template>
    </q-input>
    <q-btn
      outline
      color="transparent"
      text-color="onoutside"
      :label="$t('sendResetLink')"
      icon="send"
      type="submit"
      :disabled="v$.$invalid"
      :loading="isLoading"
    />
  </form>
  <div v-if="emailSent">
    <div class="text-h6 text-onoutside">
      {{ $t('resetLinkSent') }}
    </div>
    <div class="text-body text-onoutside">
      {{ $t('resetLinkSentText') }}
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue"
import { useVuelidate } from "@vuelidate/core"
import { required, email as emailv} from '@vuelidate/validators'
import { Auth } from "../../plugins/Auth"

const email = ref('')
const v$ = useVuelidate({
  email: {
    required,
    emailv,
  }
}, { email })
const isLoading = ref(false)
const emailSent = ref(false)
const auth = new Auth()

const submit = async () => {
  isLoading.value = true
  // Validate form
  v$.value.$touch()
  if (v$.value.$invalid) return
  // Request email sending
  try {
    await auth.resetPassword(email.value)
    emailSent.value = true
  } finally {
    isLoading.value = false
  }
}
</script>