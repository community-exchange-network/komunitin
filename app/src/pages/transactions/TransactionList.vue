<template>
  <div>
    <page-header
      :title="$t('transactions')" 
      search 
      balance
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
      </template>
    </page-header>
    <q-page-container>
      <q-page>
        <transaction-items
          :code="props.code"
          :member="myMember"
          :start-date="startDate"
          :end-date="endDate"
          :query="query"
        />
        <create-transaction-btn />
      </q-page>
    </q-page-container>
    <q-drawer 
      v-model="filterDrawer"
      side="right" 
      bordered
      show-if-above
    >
      <div class="q-pa-md column q-gutter-md">
        <div class="text-h6 text-onsurface-m">{{ $t("filters") }}</div>
        <date-field
          v-model="startDate"
          :label="$t('startDate')"
        />
        <date-field
          v-model="endDate"
          :label="$t('endDate')"
        />
      </div>
      <q-separator />
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

const props = defineProps<{
  code: string,
}>()
const store = useStore()
const myMember = computed(() => store.getters.myMember);

const query = ref("");
const filterDrawer = ref(false);
const startDate = ref<Date | null>(null);
const endDate = ref<Date | null>(null);

</script>
