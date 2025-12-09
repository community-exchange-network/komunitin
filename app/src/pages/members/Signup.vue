<template>
  <page-header
    :title="$t('signup')"
    back="/groups"
  />
  <q-page-container class="row justify-center">
    <q-page 
      v-if="settings && group" 
      id="page-signup"
      padding
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <signup-accept-terms-form
        v-if="page == 'terms'"  
        :group="group"
        :terms="settings.terms"
        @accept="toPage('credentials')"
      />
      <signup-credentials-form
        v-else-if="page == 'credentials'"
        v-model="credentials"
        :loading="loading"
        :has-back="needsTerms"
        @submit="createUser"        
        @back="toPage('terms')"
      />
      <signup-verify-form
        v-else-if="page == 'verify'"
        :loading="loading"
        @resend="resendEmail"
      />      
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "../../layouts/PageHeader.vue"
import SignupAcceptTermsForm from "./SignupAcceptTermsForm.vue"
import SignupCredentialsForm from "./SignupCredentialsForm.vue"
import SignupVerifyForm from "./SignupVerifyForm.vue"

import { useStore } from "vuex";
import { computed, ref, watchEffect } from "vue";
import { scroll } from "quasar";
import { useLocale } from "src/boot/i18n";
import { Auth } from "../../plugins/Auth"
import KError, { KErrorCode } from "src/KError";
import { Notify } from "quasar";
import { useI18n } from "vue-i18n";
import { v4 as uuid } from "uuid"

const { getScrollTarget } = scroll

const props = defineProps<{
  code: string
}>()

const store = useStore()

store.dispatch("groups/load", {
  group: props.code,
  include: "settings"
})
const group = computed(() => store.getters["groups/current"])
const settings = computed(() => group.value?.settings?.attributes)

const page = ref("terms")
const needsTerms = computed<boolean|undefined>(() => settings.value?.requireAcceptTerms)

const toPage = (name: string) => {
  page.value = name
  const el = document.getElementById("page-signup") as Element
  getScrollTarget(el).scrollTo(0, 0)
}

watchEffect(() => {
  if (needsTerms.value === false && page.value == "terms") {
    toPage("credentials")
  }
})

const credentials = ref({
  name: "",
  email: "",
  password: "",
})

const loading = ref(false)
const locale = useLocale()
const { t } = useI18n()

const createUser = async () => {
  loading.value = true
  try {
    // Create a user associated with a member.

    // Possibly ephemeral IDs for the included resources.
    const memberId = uuid()
    const settingsId = uuid()

    await store.dispatch("users/create", {
      group: props.code,
      resource: {
        type: "users",
        attributes: {
          email: credentials.value.email,
          password: credentials.value.password
        },
        relationships: {
          members: {
            data: [{ type: "members", id: memberId }]
          },
          settings: {
            data: { type: "user-settings", id: settingsId }
          }
        }
      },
      included: [{
        type: "members",
        id: memberId,
        attributes: {
          name: credentials.value.name,
          state: "draft",
        },
        relationships: {
          group: {
            data: { type: "groups", id: group.value.id }
          }
        }
      }, {
        type: "user-settings",
        id: settingsId,
        attributes: {
          language: locale.value
        }
      }]
    })
    page.value = 'verify'
  } catch (error) {
    // Catch the case where the email is already in use.
    if (error instanceof KError && error.code === KErrorCode.DuplicatedEmail) {
      Notify.create({
        message: t('emailInUse'),
        color: "negative",
        timeout: 0,
        actions: [{ label: t('close'), color: "white" }]
      })
    } else {
      throw error
    }
  } finally {
    loading.value = false
  }
}

const auth = new Auth()

const resendEmail = async () => {
  loading.value = true
  try {
    await auth.resendValidationEmail(credentials.value.email, props.code)
  } finally {
    loading.value = false
  }
}

</script>