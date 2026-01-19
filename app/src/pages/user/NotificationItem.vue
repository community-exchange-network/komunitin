<template>
  <q-item class="q-px-md q-py-lg">
    <q-item-section avatar>
      <avatar
        :text="notification.attributes.title"
        :img-src="notification.attributes.image"
      />
    </q-item-section>

    <q-item-section>
      <q-item-label class="text-weight-bold">{{ notification.attributes.title }}</q-item-label>
      <q-item-label caption lines="2">{{ notification.attributes.body }}</q-item-label>
    </q-item-section>
    <q-item-section side top>
      <q-item-label caption>
        {{ $formatDate(notification.attributes.created) }}
      </q-item-label>
    </q-item-section>
  </q-item>
</template>
<script setup lang="ts">
import { type Notification } from '../../store/model';
import Avatar from 'src/components/Avatar.vue';

defineProps<{
  notification: Notification
}>()
</script>