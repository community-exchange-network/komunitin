<template>
  <dialog-form-btn 
    :label="$t('changeEmail')"
    :text="$t('changeEmailText')"
    :valid="!v$.$invalid"
    :submit="changeEmail"
  >
    <template #default>
      <q-input
        v-model="email"
        :label="$t('email')"
        :hint="$t('emailChangeHint')"
        outlined
        :rules="[() => !v$.email.$invalid || $t('invalidEmail')]"
      />
    </template>
  </dialog-form-btn>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useStore } from 'vuex'
import useVuelidate from "@vuelidate/core"
import { required, email as vemail } from "@vuelidate/validators"
import { Notify } from "quasar"
import { useI18n } from 'vue-i18n'

import DialogFormBtn from '../../components/DialogFormBtn.vue';
import { Auth } from 'src/plugins/Auth';

const props = defineProps<{
  modelValue?: string
}>();

const email = ref(props.modelValue ?? '')
const store = useStore()

const v$ = useVuelidate({
  email: {required, vemail}
}, {email})

const { t } = useI18n()
const auth = new Auth()

const changeEmail = async () => {
  await auth.changeEmail(email.value, store.getters.accessToken)
  Notify.create({
    message: t('signupVerifyEmailText'),
    color: 'positive',
    icon: 'mail'
  })
}
</script>
