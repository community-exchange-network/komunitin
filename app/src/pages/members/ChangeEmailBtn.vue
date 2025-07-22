<template>
  <dialog-form-btn 
    :label="$t('changeEmail')"
    :text="$t('changeEmailText')"
    :valid="!v$.$invalid"
    :submit="changeEmail"
  >
    <template #default>
      <password-field
        v-if="!isAdmin"
        v-model="password"
        :label="$t('password')"
        :hint="$t('oldPasswordHint')"
        class="q-mb-md"
        :error="passwordInvalid"
      />
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
import { User, Group } from '../../store/model';
import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import useVuelidate from "@vuelidate/core"
import { required, email as vemail } from "@vuelidate/validators"
import { Notify } from "quasar"
import { useI18n } from 'vue-i18n'

import DialogFormBtn from '../../components/DialogFormBtn.vue';
import PasswordField from '../../components/PasswordField.vue';
import KError, { KErrorCode } from '../../KError';

const props = defineProps<{
  modelValue?: string
  user: User
  group: Group
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string|undefined): void
}>()

const email = ref<string|undefined>(props.modelValue)
const password = ref<string>('')
const passwordInvalid = ref(false)

const store = useStore()

const isAdmin = computed(() => store.getters.isAdmin)

const v$ = useVuelidate({
  ...(!isAdmin.value && {password: {required}}),
  email: {required, vemail}
}, {password, email})

const { t } = useI18n()

const changeEmail = async () => {
  try {
    await store.dispatch("users/update", {
      id: props.user.id,
      group: props.group.attributes.code,
      resource: {
        attributes: {
          ...(!isAdmin.value && {password: password.value}),
          email: email.value
        }
      }
    })
    emit("update:modelValue", email.value)
    Notify.create({
      message: t('emailChanged', {email: email.value}),
      color: 'positive',
      icon: 'check'
    })
  } catch (error) {
    if (error instanceof KError && error.code == KErrorCode.InvalidPassword) {
      passwordInvalid.value = true
    }
    throw error
  }
}
watch([password], () => {
  passwordInvalid.value = false
})
</script>