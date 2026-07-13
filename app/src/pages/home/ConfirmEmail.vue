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

<script setup lang="ts">
import { shallowRef, watch } from "vue"
import { useRoute } from "vue-router"
import { useStore } from "vuex"
import { Auth } from "src/plugins/Auth"
import type { ConfirmedAuthUser } from "src/plugins/Auth"
import PageHeader from "src/layouts/PageHeader.vue"
import LoginMail from "src/pages/home/LoginMail.vue"

const route = useRoute()
const store = useStore()
const status = shallowRef<"loading" | "success" | "error">("loading")
const confirmedUser = shallowRef<ConfirmedAuthUser>()

watch(
  () => route.query.token as string,
  async (token, _previousToken, onCleanup) => {
    // A previous request must not overwrite the state for a newer route token.
    let active = true
    onCleanup(() => active = false)
    status.value = "loading"
    confirmedUser.value = undefined

    try {
      const user = await new Auth().confirmEmail(token)
      if (!active) return
      confirmedUser.value = user
      if (store.getters.myUser?.id === user.id) {
        // The Social endpoint is an idempotent upsert, so this can update an
        // existing user after confirming an email change.
        await store.dispatch("users/create", {
          resource: {
            type: "users",
            attributes: { email: user.email }
          }
        })
      }
      if (active) status.value = "success"
    } catch {
      if (active) status.value = "error"
    }
  },
  { immediate: true }
)
</script>
