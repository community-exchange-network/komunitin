<template>
  <q-form
    class="q-gutter-y-lg column"
    @submit="emit('submit')"
  >
    <div>
      <div class="text-subtitle1">
        {{ $t('signupCredentialsHeader') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('signupCredentialsText') }}
      </div>
    </div>
    <q-input
      v-model="name"
      type="text"
      name="name"
      :label="$t('name')"
      :hint="$t('nameHint')"
      outlined
      required
      :rules="[(v) => !!v || $t('nameRequired')]"
    />
    <q-input
      v-model="email"
      name="email"
      :label="$t('email')"
      :hint="$t('emailChangeHint')"
      outlined
      :rules="[() => !v$.email.$invalid || $t('invalidEmail')]"
    />
    <password-field
      v-model="password"
      name="password"
      :label="$t('newPassword')"
      :hint="$t('newPasswordHint')"
    />
    <div class="row">
      <q-btn
        v-if="hasBack"
        class="col q-mr-md"
        :label="$t('back')"
        color="primary"
        flat
        @click="emit('back')"
      />
      <q-btn
        class="col"
        :label="$t('submit')"
        type="submit"
        color="primary"
        unelevated
        :disable="v$.$invalid"
        :loading="props.loading"
      />
    </div>
  </q-form>
</template>
<script setup lang="ts">
import PasswordField from '@/components/PasswordField.vue'
import useVuelidate from "@vuelidate/core"
import { required, email as vemail } from "@vuelidate/validators"
import { ref, watchEffect } from 'vue'

const props = defineProps<{
  modelValue: {
    name: string
    email: string
    password: string
  },
  hasBack: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  (e: "update:modelValue", value: {name: string, email: string, password: string}): void,
  (e: "submit"): void
  (e: "back"): void
}>()

const name = ref(props.modelValue.name)
const email = ref(props.modelValue.email)
const password = ref(props.modelValue.password)

const v$ = useVuelidate({
  email: {required, vemail},
  password: {required},
  name: {required}
}, {name, email, password})

watchEffect(() => {
  emit('update:modelValue', {name: name.value, email: email.value, password: password.value})
})

</script>