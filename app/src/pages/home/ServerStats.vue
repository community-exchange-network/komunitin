<template>
  <div>
    <page-header
      :title="t('serverStats')"
    />
    <q-page-container>
      <q-page class="q-pa-md">
        <div class="flex justify-between">
          <div class="text-onsurface-m">
            <h2 class="q-mt-md q-mb-xs text-onsurface-m">{{t('nCommunities', nCommunities)}}</h2>
            <p class="text-subtitle1">{{t('nCommunitiesText')}}</p>
          </div>
        </div>
        <q-card 
          flat 
          bordered
        >
          <groups-map :groups="groups" />
        </q-card>
        <div class="row q-col-gutter-md items-stretch q-mt-none">
          <div class="col-12 col-sm-6 col-lg-3">
            <stats-card
              class="full-height"
              value="accounts"
              :title="t('monthlyActiveAccounts')"
              :text="t('monthlyActiveAccountsText')"
              :period="30*24*60*60"
              icon="group"
            />
          </div>
          <div class="col-12 col-sm-6 col-lg-3">
            <stats-card
              class="full-height"
              value="accounts"
              :title="t('yearlyActiveAccounts')"
              :text="t('yearlyActiveAccountsText')"
              :period="365*24*60*60"
              icon="group"
            />
          </div>
          <div class="col-12 col-sm-6 col-lg-3">
            <stats-card
              class="full-height"
              value="transfers"
              :title="t('monthlyTransactions')"
              :text="t('monthlyTransactionsText')"
              :period="30*24*60*60"
              icon="swap_horiz"
            />
          </div>
          <div class="col-12 col-sm-6 col-lg-3">
            <stats-card
              class="full-height"
              value="transfers"
              :title="t('yearlyTransactions')"
              :text="t('yearlyTransactionsText')"
              :period="365*24*60*60"
              icon="swap_horiz"
            />
          </div>
        </div>
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from "vue-i18n"

import PageHeader from "src/layouts/PageHeader.vue";
import GroupsMap from "src/components/GroupsMap.vue";
import StatsCard from "src/components/StatsCard.vue";

import { computed } from "vue";
import { Group } from "src/store/model";
import { useStore } from "vuex";

const { t } = useI18n()

const store = useStore()

const fetchAllGroups = async () => {
  const cache = 1000*60*60*24 // 1 day
  await store.dispatch("groups/loadList", {
    cache
  })
  const loadRemainingGroups = async () => {
    if (store.getters["groups/hasNext"]) {
      await store.dispatch("groups/loadNext", {
        cache
      })
      await loadRemainingGroups()
    }
  }
  await loadRemainingGroups()
}

fetchAllGroups()

const groups = computed<Group[]>(() => store.getters["groups/currentList"])
const nCommunities = computed<number>(() => groups.value?.length ?? 0)

</script>