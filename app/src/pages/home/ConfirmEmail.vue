<template>
  <q-btn
    id="confirm-email"
    class="full-width"
    outline
    color="transparent"
    text-color="onoutside"
    icon="mark_email_read"
    :label="$t('confirmEmail')"
    :loading="loading"
    @click="confirmEmail"
  />
  <p
    v-if="error"
    class="text-negative q-mt-md"
  >
    {{ $t('emailConfirmationError') }}
  </p>
</template>

<script setup lang="ts">
import { shallowRef } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useStore } from "vuex"
import { Auth } from "src/plugins/Auth"
import type { ConfirmedAuthUser } from "src/plugins/Auth"
import { useEmailConfirmation } from "src/composables/useEmailConfirmation"

const route = useRoute()
const router = useRouter()
const store = useStore()
const { setConfirmation } = useEmailConfirmation()
const loading = shallowRef(false)
const error = shallowRef(false)

function signupDestination(user: ConfirmedAuthUser) {
  if (!user.signup) return undefined
  return user.signup.type === "member"
    ? `/groups/${user.signup.groupCode}/signup-member`
    : "/groups/new"
}

async function confirmEmail() {
  loading.value = true
  error.value = false
  try {
    const user = await new Auth().confirmEmail(route.query.token as string)
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

    if (store.getters.isLoggedIn) {
      await store.dispatch("logout")
    }

    setConfirmation(user)
    const redirect = signupDestination(user)
    await router.replace({
      name: "LoginMail",
      ...(redirect ? { query: { redirect } } : {})
    })
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
</script>
