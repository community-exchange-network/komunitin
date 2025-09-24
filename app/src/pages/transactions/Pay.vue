<template>
  <div class="q-mt-xl row justify-center">
    <q-spinner
      size="42px"
      color="icon-dark" 
    />
  </div>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useStore } from "vuex"
import { useUIStore } from "src/stores/ui"

// Payment link. We get to this page when scanning a transfer 
// QR code from an external app.
const url = window.location.href
const router = useRouter()
const store = useStore()
const uiStore = useUIStore()

const myMember = store.getters.myMember

// Hide navigation drawer
uiStore.drawerState = false

router.push({
  name: 'CreateTransactionSendQR',
  params: {
    code: myMember.group.attributes.code,
    memberCode: myMember.attributes.code,
  },
  query: {
    qr: url,
  }
})


</script>