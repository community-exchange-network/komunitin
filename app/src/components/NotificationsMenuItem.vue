<template>
  <menu-item
    icon="notifications"
    :title="t('notifications')"
    to="/notifications"
  >
    <q-item-section v-if="unreadCount > 0" side>
      <q-badge
        :label="unreadCount > 99 ? '99+' : unreadCount"
        color="primary"
        rounded
      />
    </q-item-section>
  </menu-item>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";
import { useI18n } from "vue-i18n";

import MenuItem from "./MenuItem.vue";

const store = useStore();
const { t } = useI18n();

// Unread count is kept up-to-date by:
// 1. loadUser (on login/authorize) dispatches notifications/updateUnreadCount
// 2. Foreground push messages optimistically increment it
// 3. Viewing the notifications page self-corrects it from the API
const unreadCount = computed(() => store.getters["notifications/unreadCount"] ?? 0);
</script>
