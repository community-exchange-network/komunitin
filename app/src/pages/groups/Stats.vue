<template>
  <div>
    <page-header
      :title="t('statistics')"
    />
    <q-page-container>
      <q-page
        v-if="group"
        class="q-pa-md"
      >
        <!-- Group -->
        <div class="row no-wrap items-center q-mb-lg">
          <avatar
            size="48px"
            :text="group.attributes.name"
            :img-src="group.attributes.image"
          />
          <div class="q-ml-md">
            <div class="text-h6 text-serif text-bold text-onsurface">
              {{ group.attributes.name }}
            </div>
            <div class="text-body2 text-weight-medium text-onsurface-m">
              {{ group.attributes.code }}
            </div>
          </div>
        </div>
        <!-- Volume key figures -->
        <div class="text-overline text-uppercase text-onsurface-d">
          {{ t('volume') }}
        </div>
        <div class="row q-col-gutter-md items-stretch">
          <div class="col-6 col-md-3">
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
          <div class="col-6 col-md-3">
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
          <div class="col-6 col-md-3">
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
          <div class="col-6 col-md-3">
            <stats-card
              value="amount"
              class="full-height"
              icon="all_inclusive"
              :title="t('allTimeVolume')"
              :text="t('allTimeVolumeText')"
              :currency="currency"
            />
          </div>
        </div>
        <!-- Charts -->
        <div class="row q-col-gutter-md q-mt-none">
          <div class="col-12 col-lg-6">
            <stats-chart 
              icon="show_chart"
              value="amount"
              :title="t('volumeChart')"
              :text="t('volumeChartText')"
              :currency="currency"  
            />
          </div>
          <div class="col-12 col-lg-6">
            <stats-chart 
              icon="group"
              value="accounts"
              :title="t('activeAccountsChart')"
              :text="t('activeAccountsChartText')"
              :parameters="{minTransactions: 1}"
              :currency="currency"
            />
          </div>
        </div>
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { useStore } from 'vuex'
import { computed, watch } from 'vue'
import type { Currency, Group } from '@/store/model'
import { useI18n } from 'vue-i18n'

import Avatar from '@/components/Avatar.vue';
import PageHeader from '@/layouts/PageHeader.vue';
import StatsCard from '@/components/StatsCard.vue';
import StatsChart from '@/components/StatsChart.vue';

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
