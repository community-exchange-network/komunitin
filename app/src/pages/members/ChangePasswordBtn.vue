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
    <div class="text-body2 text-onsurface-m q-mt-sm" role="status">
      <template v-if="emailSent">{{ $t('resetLinkSentText') }}</template>
      <template v-else>{{ $t('changePasswordText') }}</template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useStore } from "vuex"
import { Auth } from "src/plugins/Auth"

const store = useStore()
const loading = ref(false)
const emailSent = ref(false)

const sendResetLink = async () => {
  loading.value = true
  try {
    await new Auth().resetPassword(store.getters.myUser.attributes.email)
    emailSent.value = true
  } finally {
    loading.value = false
  }
}
</script>
