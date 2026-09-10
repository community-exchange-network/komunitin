<template>
  <div>
    <q-btn
      flat
      color="primary"
      class="full-width"
      icon="mail"
      :label="$t('changePassword')"
      :loading="loading"
      @click="sendResetLink"
    />
    <div class="text-body2 text-onsurface-m q-mt-sm">
      {{ $t('changePasswordText') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useStore } from "vuex"
import { useI18n } from "vue-i18n"
import { Notify } from "quasar"
import { Auth } from "src/plugins/Auth"

const store = useStore()
const { t } = useI18n()
const auth = new Auth()
const loading = ref(false)

const sendResetLink = async () => {
  loading.value = true
  try {
    await auth.resetPassword(store.getters.myUser.attributes.email)
    Notify.create({
      message: t('resetLinkSentText'),
      color: 'positive',
      icon: 'mail'
    })
  } finally {
    loading.value = false
  }
}
</script>
