<template>
  <div class="flex items-center text-onsurface-m">
    <q-spinner
      v-if="isSaving"
      size="24px"
      class="q-mr-sm"
      color="icon-dark"
    />
    <q-icon
      v-else
      :name="isError ? 'error' : 'done'"
      size="24px"
      class="q-mr-sm"
      color="icon-dark"
    />
    <div>
      {{ message }}
      {{ isError ? $t('retryIn', {seconds}) : '' }}
    </div>
    <q-space />
    <q-btn
      v-if="isError"
      :label="$t('retryNow')"
      icon="refresh"
      flat
      @click="retry"
    />
  </div>
</template>
<script setup lang="ts">
import type { Fn} from '@vueuse/shared';
import { useTimeoutFn } from '@vueuse/shared'
import { useTimestamp } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const message = ref(t("noChanges"))
const isError = ref(false)
const isSaving = ref(false)

const now = useTimestamp()
const retryAt = ref(0)
const seconds = computed(() => Math.round((retryAt.value - now.value) / 1000))

// Exponential grow until 60 secs.
let retryInterval = 0
const nextRetryInterval = () => {
  if (retryInterval == 0) {
    retryInterval = 1000
  } else if (retryInterval < 60000) {
    retryInterval = retryInterval * 2
  } else {
    retryInterval = 60000
  }
  return retryInterval
}

let lastFunction: () => Promise<void>
let stopTimeout: Fn | undefined = undefined

const save = async (fn: () => Promise<void>) => {
  if (stopTimeout) {
    stopTimeout()
  }
  lastFunction = fn
  message.value = t("savingChanges")
  isSaving.value = true
  try {
    await fn()
    isError.value = false
    message.value = t("changesSaved")
    retryInterval = 0
  } catch (error) {
    isError.value = true
    message.value = t("errorSavingChanges")
    nextRetryInterval()
    retryAt.value = Date.now() + retryInterval
    const to = useTimeoutFn(retry, retryInterval, {immediate: true})
    stopTimeout = to.stop
    throw error
  } finally {
    isSaving.value = false
  }
}

const retry = async () => {
  await save(lastFunction)
}

defineExpose({
  save
})

</script>