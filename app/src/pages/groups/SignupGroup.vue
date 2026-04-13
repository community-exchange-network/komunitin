<template>
  <page-header
    :title="$t('createGroup')"
    back="/groups"
  />
  <q-page-container class="row justify-center">
    <q-banner class="text-onsurface-m banner" v-show="showDocsBanner">
      <template #avatar>
        <q-icon name="info" />
      </template>
      {{ $t('createGroupBanner') }}
      <template #action>
        <q-btn
          flat
          color="primary"
          :label="$t('dismiss')"
          @click="showDocsBanner = false"
        />
        <q-btn
          flat
          color="primary"
          :label="$t('learnMore')"
          :href="`${docsUrl}/project/new-community`"
          target="_blank"
        />
      </template> 
    </q-banner>
    <q-page       
      padding
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <signup-credentials-form
        v-if="page == 'credentials'"
        v-model="credentials"
        :loading="loading"
        :has-back="false"
        @submit="createAdmin"        
      />
      <signup-verify-form
        v-if="page == 'verify'"
        :loading="loading"
        @resend="resendEmail"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "src/layouts/PageHeader.vue";
import SignupCredentialsForm from "src/pages/members/SignupCredentialsForm.vue";
import SignupVerifyForm from "src/pages/members/SignupVerifyForm.vue";

import { ref } from "vue";
import { useStore } from "vuex";
import { useLocale } from "src/boot/i18n";
import { v4 as uuid } from "uuid";
import KError, { KErrorCode } from "src/KError";
import { Notify } from "quasar";
import { useI18n } from "vue-i18n";
import { Auth } from "src/plugins/Auth";
import { config } from "../../utils/config"

const docsUrl = config.DOCS_URL

const page = ref("credentials")
const credentials = ref({
  name: "",
  email: "",
  password: "",
})

const loading = ref(false)

const store = useStore()
const locale = useLocale()
const { t } = useI18n()

const showDocsBanner = ref(true)

const createAdmin = async () => {
  loading.value = true
  
  const settingsId = uuid() // Ephemeral id for included resource
  try {
    await store.dispatch("users/create", {
      resource: {
        type: "users",
        attributes: {
          name: credentials.value.name,
          email: credentials.value.email,
          password: credentials.value.password
        },
        relationships: {
          settings: {
            data: { type: "user-settings", id: settingsId}
          }
        }
      },
      included: [
        {
          id: settingsId,
          type: "user-settings",
          attributes: {
            language: locale.value
          }
        }
      ]
    })
    page.value = "verify"
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
    await auth.resendValidationEmail(credentials.value.email, null)
  } finally {
    loading.value = false
  }
}

</script>
<style lang="scss" scoped>
.banner {
  border-bottom: solid 1px $separator-color;
}
</style>