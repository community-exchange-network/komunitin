<script setup lang="ts">
import { onMounted, shallowRef } from "vue"
import { useRoute } from "vue-router"
import { Auth } from "src/plugins/Auth"
import type { ConfirmedAuthUser } from "src/plugins/Auth"
import PageHeader from "src/layouts/PageHeader.vue"
import LoginMail from "src/pages/home/LoginMail.vue"

const route = useRoute()
const status = shallowRef<"loading" | "success" | "error">("loading")
const confirmedUser = shallowRef<ConfirmedAuthUser>()

onMounted(async () => {
  try {
    confirmedUser.value = await new Auth().confirmEmail(route.query.token as string)
    status.value = "success"
  } catch {
    status.value = "error"
  }
})
</script>

<template>
  <PageHeader :title="$t('confirmEmail')" />
  <q-page-container>
    <q-page class="flex flex-center">
      <q-spinner-dots v-if="status === 'loading'" color="primary" size="50px" />
      <div v-else class="q-pa-md text-center">
        <q-icon
          :name="status === 'success' ? 'check_circle' : 'error'"
          :color="status === 'success' ? 'positive' : 'negative'"
          size="64px"
        />
        <p class="text-body1 text-onsurface-m q-my-lg">
          {{ $t(status === 'success' ? 'emailConfirmed' : 'emailConfirmationError') }}
        </p>
        <LoginMail
          v-if="status === 'success' && confirmedUser?.signup"
          :confirmed-email="confirmedUser.email"
          :signup="confirmedUser.signup"
        />
        <q-btn
          v-else
          color="primary"
          :label="$t('logIn')"
          to="/login-mail"
          unelevated
        />
      </div>
    </q-page>
  </q-page-container>
</template>
