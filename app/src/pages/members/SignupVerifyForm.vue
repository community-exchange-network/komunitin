<template>
  <div>
    <div class="text-title-large">
      {{ $t('signupVerifyEmail') }}
    </div>
    <div>
      <div class="float-left q-pr-md">
        <q-icon
          name="forward_to_inbox"
          size="100px"
          color="icon"
        />
      </div>
      <div class="text-body-large text-on-surface-medium q-pt-md">
        {{ $t('signupVerifyEmailText') }}
      </div>
    </div>
    <div>
      <q-btn
        class="q-my-lg full-width"
        color="primary"
        flat
        :label="$t('resendEmail')"
        :loading="loading"
        @click="emit('resend')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  loading: boolean
}>()

const emit = defineEmits<{
  resend: []
}>()
</script>
