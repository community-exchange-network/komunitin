<template>
  <div class="q-mt-xl row justify-center">
    <q-spinner
      size="42px"
      color="icon-dark"
    />
  </div>
</template>
<script setup lang="ts">
// We get to this page when scanning an NFC tag and clicking "open link"

import { useRouter } from 'vue-router'
import { useStore } from "vuex"

const router = useRouter()
const store = useStore()

const myMember = store.getters.myMember

// Hide navigation drawer
store.commit('drawerState', false)

router.push({
  name: 'CreateTransactionReceiveNFC',
  params: {
    code: myMember.group.attributes.code,
    memberCode: myMember.attributes.code,
  }
})
</script>