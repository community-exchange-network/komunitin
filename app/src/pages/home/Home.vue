<template>
  <page-header
    search
    :title="$t('home')"
    balance
    @search="query = $event"
  >
    <template #search-actions="{ dense }">
      <q-btn
        flat
        round
        :dense="dense"
        :icon="advancedFiltersOpen ? 'filter_list_off' : 'filter_list'"
        :title="advancedFiltersOpen ? $t('hideFilters') : $t('showFilters')"
        @click="advancedFiltersOpen = !advancedFiltersOpen"
      />
    </template>
    <template #below>
      <feed-filter
        v-model:type="feedType"
        v-model:sort="sortOption"
      />
    </template>
  </page-header>
  <advanced-filters
    v-model="advancedFiltersOpen"
    :code="code"
    v-model:category="feedCategory"
    v-model:date-from="dateFrom"
    v-model:date-to="dateTo"
  />
  <q-page-container>
    <q-page v-if="code">
      <resource-cards
        :key="feedType"
        :code="code"
        :type="resourceTypes"
        include="category,member,member.group,member.group.currency,member.account"
        :sort="resourceSort"
        :query="query"
        :filter="filter"
      />
      <floating-btn-menu 
        :actions="actions" 
        color="white"
        text-color="primary"
      />
    </q-page>
  </q-page-container>
</template>

<script lang="ts" setup>
import { useStore } from 'vuex';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PageHeader from '../../layouts/PageHeader.vue';
import ResourceCards from '../ResourceCards.vue';
import FloatingBtnMenu, { type FABAction } from '../../components/FloatingBtnMenu.vue';
import FeedFilter, { type FeedType, type SortOption } from '../../components/FeedFilter.vue';
import AdvancedFilters from '../../components/AdvancedFilters.vue';


const store = useStore();
const query = ref("");
const feedType = ref<FeedType>("all");
const feedCategory = ref<string | null>(null);
const dateFrom = ref<Date | null>(null);
const dateTo = ref<Date | null>(null);
const sortOption = ref<SortOption>("date");
const advancedFiltersOpen = ref(false);

const resourceTypes = computed(() => {
  if (feedType.value === "offers") return ["offers"];
  if (feedType.value === "needs") return ["needs"];
  return ["offers", "needs"];
})

const resourceSort = computed(() => sortOption.value === "distance" ? "location" : "-updated")

const toISODate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
// The "to" date is made exclusive of the following day so the whole selected day is included.
const addOneDay = (date: Date) => {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return toISODate(next);
}
const filter = computed(() => {
  const f: Record<string, string | { gt?: string, lt?: string }> = { status: "published", expired: "false" };
  if (feedCategory.value) f.category = feedCategory.value;
  if (dateFrom.value || dateTo.value) {
    f.created = {
      gt: dateFrom.value ? toISODate(dateFrom.value) : undefined,
      lt: dateTo.value ? addOneDay(dateTo.value) : undefined,
    };
  }
  return f;
});

const code = computed(() => store.getters.myGroup?.attributes.code)

const { t } = useI18n()
const actions = computed<FABAction[]>(() => [{
  label: t('createNeed'),
  icon: 'loyalty',
  color: 'kred',
  to: `/groups/${code.value}/needs/new`
}, {
  label: t('createOffer'),
  icon: 'local_offer',
  color: 'kblue',
  to: `/groups/${code.value}/offers/new`
}])

</script>
