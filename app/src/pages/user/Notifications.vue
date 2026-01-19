<template>
  <page-header 
    :title="t('notifications')" 
    balance 
    :back="`/`"
  />
  <q-page-container>
    <q-page>
      <resource-cards
        v-slot="slotProps"
        :code="myGroup.attributes.code"
        type="notifications"

      >
        <q-list 
          v-if="slotProps.resources"
          separator
        >
          <template
            v-for="group of groupNotifications(slotProps.resources)"
            :key="group.title"
          >
            <q-item-label header class="text-overline text-uppercase q-pb-none">{{ group.title }}</q-item-label>
            <notification-item
              v-for="notification of group.items"
              :key="notification.id"
              :notification="notification"
            />
          </template>
        </q-list>
        <q-separator />
      </resource-cards>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useStore } from "vuex";
import { isToday, isYesterday, isThisWeek, isThisMonth, format } from 'date-fns';
import { getDateLocale } from '../../boot/i18n';
import type { Notification } from '../../store/model';

import ResourceCards from "../ResourceCards.vue";
import NotificationItem from "./NotificationItem.vue";
import PageHeader from "../../layouts/PageHeader.vue";

const { t } = useI18n();
const store = useStore();

const myMember = computed(() => store.getters.myMember);
const myGroup = computed(() => myMember.value.group);

const groupNotifications = (notifications: Notification[]) => {
  const locale = getDateLocale();
  const todayItems: Notification[] = [];
  const yesterdayItems: Notification[] = [];
  const thisWeekItems: Notification[] = [];
  const thisMonthItems: Notification[] = [];
  const olderItems: Map<string, Notification[]> = new Map();

  notifications.forEach(n => {
    const d = new Date(n.attributes.created);
    if (isToday(d)) {
      todayItems.push(n);
    } else if (isYesterday(d)) {
      yesterdayItems.push(n);
    } else if (isThisWeek(d, { locale })) {
      thisWeekItems.push(n);
    } else if (isThisMonth(d)) {
      thisMonthItems.push(n);
    } else {
      let monthYear = format(d, 'MMMM yyyy', { locale });
      monthYear = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
      
      if (!olderItems.has(monthYear)) {
         olderItems.set(monthYear, []);
      }
      olderItems.get(monthYear).push(n);
    }
  });

  const result = [];
  if (todayItems.length) result.push({ title: t('today'), items: todayItems });
  if (yesterdayItems.length) result.push({ title: t('yesterday'), items: yesterdayItems });
  if (thisWeekItems.length) result.push({ title: t('thisWeek'), items: thisWeekItems });
  if (thisMonthItems.length) result.push({ title: t('thisMonth'), items: thisMonthItems });
   
  for (const [title, items] of olderItems) {
     result.push({ title, items });
  }
   
  return result;
};

</script>
