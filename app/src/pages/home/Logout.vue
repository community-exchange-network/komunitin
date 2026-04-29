<template>
  <div></div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { useQuasar } from 'quasar'
import { onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const { t } = useI18n()
const quasar = useQuasar()
quasar.loading.show({ 
  message: t('loggingOut'),
  delay: 100
})

const store = useStore()
const router = useRouter()
const route = useRoute()

const redirect = computed(() => {
  // The boot handler will redirect logged in users from "/" to their group home.
  return (typeof route.query.redirect == "string") ? route.query.redirect : "/";
})

onMounted(async () => {
  await store.dispatch('logout')
  quasar.notify({ type: 'info', message: t('loggedOut') })
  await router.push(redirect.value)
  quasar.loading.hide()
})
</script>
