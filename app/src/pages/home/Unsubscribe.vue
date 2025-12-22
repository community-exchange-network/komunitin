<template>
  <q-page class="flex flex-center">
    <div class="q-pa-md text-center" style="max-width: 500px">
      <q-spinner-dots
        v-if="loading"
        color="primary"
        size="50px"
      />
      <template v-else-if="success">
        <q-icon
          name="check_circle"
          color="positive"
          size="64px"
          class="q-mb-md"
        />
        <h5 class="q-mt-md q-mb-sm">
          {{ t('unsubscribed') }}
        </h5>
        <p class="text-body1 text-onsurface-m q-mb-lg">
          {{ t('unsubscribedText') }}
        </p>
      </template>
      <template v-else-if="error">
        <q-icon
          name="error"
          color="negative"
          size="64px"
          class="q-mb-md"
        />
        <h5 class="q-mt-md q-mb-sm">
          {{ t('unsubscribeError') }}
        </h5>
        <p class="text-body1 text-onsurface-m">
          {{ error }}
        </p>
      </template>
      <q-btn
        color="primary"
        :label="$t('settings')"
        unelevated
        class="q-mb-sm"
        to="/settings"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
/** 
 * This is a standalone page to handle unsubscription from community emails.
 */
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';


const { t } = useI18n();
const route = useRoute();

const loading = ref(true);
const success = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  const token = route.query.token as string;

  try {
    // POST to /users/me/unsubscribe with the token
    await fetch(`/users/me/unsubscribe?token=${token}`, {
      method: 'POST',
    });
    success.value = true;
  } catch (err) {
    error.value = err.response?.data?.message;
  } finally {
    loading.value = false;
  }
});

</script>
