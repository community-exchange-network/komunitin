<template>
  <q-item 
    class="q-px-md q-pt-md q-pb-lg"
    :clickable="link !== false"
    :to="link"
  >
    <q-item-section avatar>
      <avatar
        :text="notification.attributes.title"
        :img-src="notification.attributes.image"
      />
    </q-item-section>

    <q-item-section>
      <q-item-label class="text-weight-medium">{{ notification.attributes.title }}</q-item-label>
      <q-item-label caption lines="3">{{ notification.attributes.body }}</q-item-label>
    </q-item-section>
    <q-item-section side top>
      <q-item-label caption>
        {{ $formatDate(notification.attributes.created) }}
      </q-item-label>
    </q-item-section>
  </q-item>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { type Notification } from '../../store/model';
import Avatar from 'src/components/Avatar.vue';

const props = defineProps<{
  notification: Notification
}>()

const link = computed(() => props.notification.attributes.data?.route ?? false);
</script>