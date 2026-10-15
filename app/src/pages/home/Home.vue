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
import { addDays, startOfDay } from 'date-fns';
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

// Distance sorting needs the user location, which is sent along as the `near` param.
const resourceSort = computed(() =>
  sortOption.value === "distance" && store.state.me.location ? "distance" : "-updated"
)

const filter = computed(() => {
  const f: Record<string, string | { gt?: string, lt?: string }> = { status: "published", expired: "false" };
  if (feedCategory.value) f.category = feedCategory.value;
  if (dateFrom.value || dateTo.value) {
    // Local day bounds as ISO timestamps. "to" is exclusive of the following
    // day so the whole selected day is included.
    f.created = {
      gt: dateFrom.value ? startOfDay(dateFrom.value).toISOString() : undefined,
      lt: dateTo.value ? startOfDay(addDays(dateTo.value, 1)).toISOString() : undefined,
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
