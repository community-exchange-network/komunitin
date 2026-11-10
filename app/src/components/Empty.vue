<template>
  <div class="row justify-center q-pa-md full-width">
    <q-card class="col-12 col-sm-10 col-md-8 q-pa-md">
      <q-card-section class="flex justify-center q-mt-md">
        <q-avatar color="surface-container" text-color="on-surface-variant" icon="upcoming" size="4rem"/>
      </q-card-section>
      <section class="flex justify-center q-mb-md">
        <span class="text-title-large text-on-surface-medium">{{ text || $t('nothingHere') }}</span>
      </section>
      <div class="text-center">
        <slot />
      </div>
    </q-card>
  </div>
</template>
<script setup lang="ts">
defineProps<{
  text?: string
}>()
</script>
