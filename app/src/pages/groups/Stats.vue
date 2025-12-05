<template>
  <div>
    <page-header
      :title="t('statistics')"
    >
    </page-header>
    <q-page-container>
      <q-page class="q-pa-md">
        <group-header :group="group" class="q-pl-none" />
        <div class="text-overline text-uppercase text-onsurface-m q-mt-lg q-mb-sm">
          {{ t('volume') }}
        </div>
        <div class="row q-col-gutter-md items-stretch">
          <div class="col-12 col-sm-6 col-lg-3">
            <stats-card
              value="amount"
              class="full-height"
              icon="today"
              :title="t('dailyVolume')"
              :text="t('dailyVolumeText')"
              :currency="currency"
              :period="24*60*60"
            />
          </div>
          <div class="col-12 col-sm-6 col-lg-3">
            <stats-card
              value="amount"
              class="full-height"
              icon="calendar_month"
              :title="t('monthlyVolume')"
              :text="t('monthlyVolumeText')"
              :currency="currency"
              :period="30*24*60*60"
            />
          </div>
          <div class="col-12 col-sm-6 col-lg-3">
            <stats-card
              value="amount"
              class="full-height"
              icon="sunny"
              :title="t('yearlyVolume')"
              :text="t('yearlyVolumeText')"
              :currency="currency"
              :period="365*24*60*60"
            />
          </div>
          <div class="col-12 col-sm-6 col-lg-3">
            <stats-card
              value="amount"
              class="full-height"
              icon="all_inclusive"
              :currency="currency"
              :title="t('allTimeVolume')"
              :text="t('allTimeVolumeText')"
            />
          </div>
        </div>
        <div class="q-mt-md">
          <stats-chart 
            icon="show_chart"
            value="amount"
            :title="t('volumeChart')"
            :text="t('volumeChartText')"
            :currency="currency"  
          />
        </div>
        <div class="text-overline text-uppercase text-onsurface-m q-mt-lg q-mb-sm">
          {{ t('accounts') }}
        </div>
        <div class="q-mt-md">
          <stats-chart 
            icon="show_chart"
            value="accounts"
            :title="t('activeAccountsChart')"
            :text="t('activeAccountsChartText')"
            :parameters="{minTransactions: 1}"
            :currency="currency"
          />
        </div>
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { useStore } from 'vuex'
import { computed, watch } from 'vue'
import type { Currency, Group } from 'src/store/model'
import { useI18n } from 'vue-i18n'

import GroupHeader from 'src/components/GroupHeader.vue';
import PageHeader from 'src/layouts/PageHeader.vue';
import StatsCard from 'src/components/StatsCard.vue';
import StatsChart from 'src/components/StatsChart.vue';

const props = defineProps<{
  code: string
}>()

const store = useStore()
const { t } = useI18n()
// Fetch data
watch(() => props.code, async () => {
  await store.dispatch("groups/load", {
    group: props.code,
    include: "currency",
    cache: 5*60*1000
  })
}, {immediate: true})

const group = computed<Group & {currency: Currency}>(() => store.getters['groups/current'])
const currency = computed<Currency>(() => group.value.currency)

</script>
