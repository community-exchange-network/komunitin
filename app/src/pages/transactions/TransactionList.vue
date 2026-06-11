<template>
  <div>
    <page-header
      :title="$t('transactions')" 
      search 
      :balance="props.headerBalance"
      @search="query = $event" 
    >
      <template #buttons>
        <q-btn
          flat
          round
          :icon="filterDrawer ? 'filter_list_off' : 'filter_list'"
          :title="filterDrawer ? $t('hideFilters') : $t('showFilters')"
          @click="filterDrawer = !filterDrawer"
        />
        <q-btn
          v-if="store.getters.isAdmin"  
          flat
          round
          icon="download"
          :title="$t('downloadCSV')"
          @click="download"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page class="q-px-md q-pt-md">
        <transaction-items
          :code="props.code"
          :member="myMember"
          :from="startDate"
          :to="toDate"
          :query="query"
          :both-accounts="props.bothAccounts"
        />
        <create-transaction-btn />
      </q-page>
    </q-page-container>
    <q-drawer 
      v-model="filterDrawer"
      side="right"
      class="rounded-drawer-left" 
      show-if-above
    >
      <div class="column">
        <div class="q-px-md q-pt-md q-pb-sm text-serif text-bold text-subtitle1 text-onsurface-h">{{ $t("filters") }}</div>
        <q-separator />
        <div class="q-pa-md q-gutter-sm">
          <p class="text-caption-sm text-uppercase text-weight-bold text-onsurface-m">{{ $t("dateRange") }}</p>
          <date-field
            v-model="startDate"
            :label="$t('startDate')"
            clearable
          />
          <date-field
            v-model="endDate"
            :label="$t('endDate')"
            clearable
            :options="{
              min: startDate
            }"
          />
        </div>
      </div>      
    </q-drawer>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "vuex";

import PageHeader from "../../layouts/PageHeader.vue";
import CreateTransactionBtn from "../../components/CreateTransactionBtn.vue";
import TransactionItems from "./TransactionItems.vue";
import DateField from "../../components/DateField.vue";
import { useTransfersCsv } from "../../composables/downloadCsv";

const props = defineProps<{
  code: string,
  headerBalance?: boolean
  bothAccounts?: boolean
  onlyMine?: boolean
}>()
const store = useStore()
const myMember = computed(() => props.onlyMine ? store.getters.myMember : undefined);

const query = ref("");
const filterDrawer = ref(false);
const startDate = ref<Date | null>(null);
const endDate = ref<Date | null>(null);

// Adjust endDate to include the whole day
const toDate = computed(() => {
  if (endDate.value) {
    const d = new Date(endDate.value);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return null;
});

const {download} = useTransfersCsv({
  code: props.code,
  from: startDate,
  to: toDate
})

</script>
