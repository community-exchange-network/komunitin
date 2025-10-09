<template>
  <q-form
    class="q-gutter-y-lg column"
    @submit="emit('accept')"
  >
    <div>
      <div class="text-subtitle1">
        {{ $t('membershipTerms') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('membershipTermsText') }}
      </div>
    </div>
    <group-header
      :group="group"
      class="q-pl-none"
    />
    <!-- eslint-disable vue/no-v-html -->
    <div
      class="col text-body1 text-onsurface"
      v-html="md2html(terms)"
    />
    <!-- eslint-enable vue/no-v-html -->
    <q-btn
      :label="$t('acceptTerms')"
      type="submit"
      color="primary"
      padding="xs lg"
      unelevated
    />
  </q-form>
</template>
<script setup lang="ts">
import type { Group } from 'src/store/model';
import md2html from 'src/plugins/Md2html';
import GroupHeader from 'src/components/GroupHeader.vue'

defineProps<{
  group: Group
  terms: string
}>()

const emit = defineEmits<{
  (e: 'accept'): void
}>()

</script>