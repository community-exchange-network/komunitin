<template>
  <div 
    v-if="isNfcAvailable && !nfcError"
    class="column q-gutter-y-lg items-center"
  >
    <q-spinner-radio 
      :size="100"
      :color="dark ? 'onoutside' : 'primary'"
    />
    <div 
      :class="{
        'text-onoutside': dark,
        'text-onsurface': !dark
      }"
    >
      {{ $t('scanningNfc') }}
    </div>
    <q-btn
      flat
      :label="$t('cancel')"
      :color="dark ? 'onoutside' : 'primary'"
      @click="cancel()"
    />
  </div>
  <div 
    v-else
    class="column q-gutter-y-lg items-center"
  >
    <q-icon 
      name="warning"
      size="100px" 
      :color="dark ? 'onoutside' : 'negative'"
    />
    <div>
      {{ !isNfcAvailable ? $t('ErrorNFCUnavailable') : $t("ErrorNFCReadError") }}
    </div>
    <q-btn
      v-if="isNfcAvailable"
      flat
      :label="$t('scanNfc')"
      :color="dark ? 'onoutside' : 'primary'"
      @click="startScan()"
    />
  </div>
</template>
<script setup lang="ts">
import { isNfcAvailable, scan } from '@/composables/webNfc'
import KError, { KErrorCode } from '@/KError'
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  dark?: boolean
}>()

const emit = defineEmits<{
  (e: 'detected', serialNumber: string): void,
  (e: 'cancel'): void
}>()

const scanning = ref(false)
const nfcError = ref(false)

let ctrl : AbortController

const startScan = async () => {
  if (scanning.value) {
    return
  }
  nfcError.value = false
  try {
    scanning.value = true
    ctrl = new AbortController()

    const {serialNumber} = await scan(ctrl)
    emit('detected', serialNumber)

  } catch (error) {
    nfcError.value = true
    if (error instanceof KError) {
      throw error
    } else {
      throw new KError(KErrorCode.NFCReadError, (error as Error).message, error)  
    }
  } finally {
    ctrl.abort()
    scanning.value = false
  }
}

const stopScan = () => {
  if (ctrl) {
    ctrl.abort()
  }
  scanning.value = false
}

const cancel = () => {
  stopScan()
  emit('cancel')
}
onBeforeUnmount(stopScan)

onMounted(async () => {
  if (isNfcAvailable) {
    await startScan()
  }
})

</script>