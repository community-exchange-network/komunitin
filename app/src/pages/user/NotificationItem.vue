<template>
  <q-item 
    class="q-px-md q-pt-md q-pb-lg"
    :class="{ 'bg-active': !isRead }"
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
      <q-item-label :class="isRead ? '' : 'text-weight-bold'">{{ notification.attributes.title }}</q-item-label>
      <q-item-label caption lines="3">{{ notification.attributes.body }}</q-item-label>
    </q-item-section>
    <q-item-section side top>
      <q-item-label caption>
        {{ $formatDate(notification.attributes.created) }}
      </q-item-label>
      <q-icon
        v-if="!isRead"
        name="circle"
        color="primary"
        size="8px"
        class="q-mt-xs"
      />
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
const isRead = computed(() => props.notification.attributes.read !== null);
</script>