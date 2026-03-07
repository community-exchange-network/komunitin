<template>
  <q-input
    v-model="value"
    :error-message="$t('ErrorNFCUnavailable')"
    :error="!isNfcAvailable"
    :disabled="!isNfcAvailable"
    readonly
    @click="scan"
    @focus="scan"
  >
    <template #append>
      <q-icon name="sym_r_nfc" />
    </template>
    <q-dialog 
      v-model="scanning"
      persistent
    >
      <nfc-tag-scanner
        dark
        @detected="onDetected"
        @cancel="scanning = false"
      />
    </q-dialog>
  </q-input>
</template>
<script setup lang="ts">
import { computed, ref } from "vue"
import NfcTagScanner from "./NfcTagScanner.vue"
import { isNfcAvailable } from "src/composables/webNfc"

const props = defineProps<{
  modelValue: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const scan = () => {
  if (!isNfcAvailable) {
    return
  }
  scanning.value = true
}

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const scanning = ref(false)

const onDetected = (serialNumber: string) => {
  value.value = serialNumber
  scanning.value = false
}

</script>