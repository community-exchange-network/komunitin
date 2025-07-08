<template>
  <q-input
    v-model="pass"
    outlined
    :type="isPwd ? 'password' : 'text'"
    :label="$t('password')"
    autocomplete="current-password"
    maxlength="255"
    :rules="[v => (!!v && (v.length >= minLength)) || $t('invalidPassword')]"
    lazy-rules
  >
    <template #append>
      <q-icon
        :name="isPwd ? 'visibility' : 'visibility_off'"
        class="cursor-pointer"
        @click="isPwd = !isPwd"
      />
    </template>
  </q-input>
</template>
<script setup lang="ts">
import { computed, ref } from "vue"

const props = withDefaults(defineProps<{
  modelValue: string,
  minLength?: number
}>(), {
  minLength: 4
})

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void
}>()

const pass = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
})

const isPwd = ref(true)
</script>