<template>
  <q-page-container>
    <q-page class="bg-surface flex flex-center">
      <empty :text="$t('sorryNothingHere')">
        <q-btn
          class="q-mt-xl"
          color="primary"
          unelevated
          :to="to"
          :label="$t('back')"
        />
      </empty>
    </q-page>
  </q-page-container>
</template>

<script setup lang="ts">
import Empty from '../components/Empty.vue'

withDefaults(defineProps<{
  to?: string
}>(), {
  to: '/'
})
</script>
