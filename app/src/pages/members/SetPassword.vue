<template>
  <page-header 
    :title="$t('setPassword')" 
    balance 
    :back="`/groups/${code}/members/${memberCode}`"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <div class="q-pb-lg">
        <div class="text-subtitle1">
          {{ $t('setPassword') }}
        </div>
        <div class="text-onsurface-m">
          {{ $t('setPasswordText') }}
        </div>
      </div>
      <form @submit.prevent="onSubmit">
        <password-field
          v-model="newPassword"
          :label="$t('newPassword')"
          :hint="$t('newPasswordHint')"
          :min-length="8"
        />
        <q-btn
          class="q-mt-lg"
          color="primary"
          type="submit"
          unelevated
          :label="$t('setPassword')"
          :disable="!valid"
          :loading="loading"
        />
      </form>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "../../layouts/PageHeader.vue"
import PasswordField from "../../components/PasswordField.vue"

import { useStore } from "vuex"
import { computed, ref } from "vue"
import { Notify } from "quasar"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"


const store = useStore()

const myMember = computed(() => store.getters.myMember)
const code = computed(() => myMember.value.group.attributes.code)
const memberCode = computed(() => myMember.value.attributes.code)

const newPassword = ref("")

const loading = ref(false)
const valid = computed(() => newPassword.value.length >= 8)

const {t} = useI18n()

const router = useRouter()

const myUser = computed(() => store.getters.myUser)

const onSubmit = async () => {
  loading.value = true
  try {
    await store.dispatch("users/update", {
      id: myUser.value.id,
      group: code.value,
      resource: {
        attributes: {
          newPassword: newPassword.value,
        }
      }
    })
    Notify.create({
      message: t('passwordChanged'),
      color: 'positive',
    })
    
    // Renew tokens.
    await store.dispatch("login", {
      email: myUser.value.attributes.email,
      password: newPassword.value
    })

    router.push(`/groups/${code.value}/members/${memberCode.value}`)
  } finally {
    loading.value = false
  }
}
</script>