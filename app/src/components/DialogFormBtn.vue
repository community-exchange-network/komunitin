<template>
  <q-btn
    flat
    color="primary"
    :label="label"
    :icon="icon"
    v-bind="$attrs"
    @click="showDialog = true"
  />
  <q-dialog v-model="showDialog">
    <q-card style="min-width: 300px;">
      <form @submit.prevent="onSubmit">
        <q-card-section>
          <div class="flex justify-between">
            <div class="text-h6">
              {{ label }}
            </div>
            <q-btn
              flat
              round
              icon="sym_r_close"
              style="margin-top: -8px; margin-right: -8px;"
              @click="showDialog = false"
            />
          </div>
          <div 
            v-if="text"
            class="q-mt-md text-body2 text-onsurface-m"
          >
            {{ text }}
          </div>
        </q-card-section>
        <q-card-section>
          <slot />
        </q-card-section>
        <q-card-section class="flex justify-between">
          <slot name="actions" />
          <q-btn
            color="primary"
            type="submit"
            unelevated
            :label="label"
            :disable="valid !== undefined && !valid"
            :loading="loading"
          />
        </q-card-section>
      </form>
    </q-card>
  </q-dialog>
</template>
<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  label: string
  text?: string
  icon?: string
  valid?: boolean
  submit: () => void | Promise<void>
}>();

const showDialog = ref(false)
const loading = ref(false)

const onSubmit = async () => {
  loading.value = true
  try {
    await props.submit()
    showDialog.value = false
  } finally {
    loading.value = false
  }
}

</script>