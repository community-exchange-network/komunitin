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
import { computed, onMounted } from "vue";
import { useStore } from "vuex";
import { useI18n } from "vue-i18n";

import MenuItem from "./MenuItem.vue";

const store = useStore();
const { t } = useI18n();

const unreadCount = computed(() => store.getters["notifications/unreadCount"] ?? 0);

// The unread count is fetched as a field in the meta attribute of the notifications list, 
// so we trigger a loadList action to update it.
const fetchUnreadCount = async () => {
  const myMember = store.getters.myMember;
  const group = myMember?.group.attributes.code;
  
  if (group) {
    await store.dispatch("notifications/loadList", {
      group,
      onlyResources: true,
      pageSize: 1,
    });
  }
};

onMounted(fetchUnreadCount);
</script>
