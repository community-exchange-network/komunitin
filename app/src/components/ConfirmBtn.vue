<template>
  <q-btn
    :icon="props.icon"
    :color="props.btnColor ?? props.color"
    :round="props.round"
    :label="hasButtonLabel ? props.label : undefined"
    :title="props.label"
    @click="confirm = true"
  >
    <q-dialog v-model="confirm">
      <q-card class="q-pa-md">
        <q-card-section class="row items-center">
          <q-avatar
            class="q-mr-md"
            :icon="props.icon"
            :color="props.color"
            text-color="white"
          />
          <div class="text-h6">
            {{ props.label }}
          </div>
        </q-card-section>
        <q-card-section>
          <slot />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            :label="t('cancel')"
            color="onsurface-m"
          />
          <q-btn 
            v-close-popup
            unelevated
            fill
            :label="props.label"
            :color="props.color"
            @click="emit('confirm')"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-btn>
</template>
<script setup lang="ts">


import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  icon: string
  color: string
  btnColor?: string
  label: string
  round?: boolean
}>()

const { t } = useI18n() 

const confirm = ref(false)
const hasButtonLabel = computed(() => !props.round)

const emit = defineEmits<{
  (e: 'confirm'): void
}>()

</script>