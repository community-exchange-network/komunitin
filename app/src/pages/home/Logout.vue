<template>
  <div></div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { useQuasar } from 'quasar'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const quasar = useQuasar()
quasar.loading.show({ 
  message: t('loggingOut'),
  delay: 100
})

const store = useStore()
const router = useRouter()

onMounted(async () => {
  await store.dispatch('logout')
  quasar.notify({ type: 'info', message: t('loggedOut') })
  await router.push('/')
  quasar.loading.hide()
})
</script>
