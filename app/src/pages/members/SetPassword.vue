<template>
  <page-header 
    :title="$t('setPassword')" 
    back="/login-mail"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <div class="q-pb-lg">
        <div class="text-subtitle1">
          {{ $t('setPassword') }}
        </div>
        <div class="text-onsurface-m">
          {{ $t('setPasswordText') }}
        </div>
      </div>
      <div v-if="invalidToken" role="alert">
        <p>{{ $t('passwordResetError') }}</p>
        <router-link to="/forgot-password">{{ $t('sendResetLink') }}</router-link>
      </div>
      <form v-else @submit.prevent="onSubmit">
        <password-field
          v-model="newPassword"
          :label="$t('newPassword')"
          :hint="$t('newPasswordHint')"
          :min-length="8"
        />
        <q-btn
          class="q-mt-lg"
          color="primary"
          type="submit"
          unelevated
          :label="$t('setPassword')"
          :disable="!valid"
          :loading="loading"
        />
      </form>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "../../layouts/PageHeader.vue"
import PasswordField from "../../components/PasswordField.vue"

import { computed, ref } from "vue"
import { useStore } from "vuex"
import KError, { KErrorCode } from "src/KError"
import { Notify } from "quasar"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"
import { Auth } from "src/plugins/Auth"


const newPassword = ref("")

const loading = ref(false)
const valid = computed(() => newPassword.value.length >= 8)

const {t} = useI18n()

const router = useRouter()
const route = useRoute()
const auth = new Auth()
const store = useStore()
const invalidToken = ref(typeof route.query.token !== "string" || !route.query.token)

const onSubmit = async () => {
  loading.value = true
  try {
    await auth.changePassword(route.query.token as string, newPassword.value)
    newPassword.value = ""
    await store.dispatch("logout")
    Notify.create({
      message: t('passwordChanged'),
      color: 'positive',
    })
    
    await router.replace("/login-mail")
  } catch (error) {
    if (error instanceof KError && error.code === KErrorCode.IncorrectRequest) {
      invalidToken.value = true
    } else {
      throw error
    }
  } finally {
    loading.value = false
  }
}
</script>
