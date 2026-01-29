<template>
  <div>
    <page-header
      search
      :title="$t('members')"
      balance
      @search="query = $event"
    />
    <q-page-container>
      <q-page style="padding-top: 70px;">
        <div 
          class="text-overline text-uppercase text-onsurface-d q-pt-md q-px-md row justify-between"
        >
          <div>
            {{ $t('account') }}
          </div>
          <div 
            v-if="showBalances" 
            class="text-right"
          >
            {{ $t('balance') }}
          </div>
        </div>
          
        <resource-cards
          v-slot="slotProps"
          :code="code"
          type="members"
          include="contacts,account"
          :query="query"
        >
          <q-list
            v-if="slotProps.resources"
            padding
          >
            <member-header
              v-for="member of slotProps.resources"
              :key="member.id"
              :member="member"
              :to="`/groups/${code}/members/${member.attributes.code}`"
            >
              <template v-if="showBalances" #side>
                <div class="column items-end">
                  <div
                    class="col currency text-h6"
                    :class="
                      member.account.attributes.balance >= 0
                        ? 'positive-amount'
                        : 'negative-amount'
                    "
                  >
                    {{
                      FormatCurrency(
                        member.account.attributes.balance,
                        member.account.currency
                      )
                    }}
                  </div>
                </div>
              </template>
            </member-header>
          </q-list>
        </resource-cards>

        <!-- Placed at the bottom so we don't have to mess with z-index -->
        <q-page-sticky expand position="top" class="block"> 
          <nav 
            class="flex justify-between q-gutter-x-md q-py-sm q-px-md row bg-white"
            >
            <router-link :to="`/groups/${code}/stats`" 
              style="text-decoration: none; color: inherit; height: fit-content;"
              class="col">
              <q-card 
                flat
                class="transition-all bg-active text-onsurface-m"
              >
                <q-card-section class="text-center">
                  <q-icon name="insert_chart" size="sm"/>
                  <div class="text-body2 text-weight-medium">
                    {{ $t('statistics') }}
                  </div>
                </q-card-section>
              </q-card>
            </router-link>
  
            <router-link :to="`/groups/${code}`" 
              style="text-decoration: none; color: inherit; height: fit-content;"
              class="col">
              <q-card 
                flat
                class="transition-all bg-active text-onsurface-m"
              >
                <q-card-section class="text-center">
                  <q-icon name="info" size="sm"/>
                  <div class="text-body2 text-weight-medium">
                    {{ $t('about') }}
                  </div>
                </q-card-section>
              </q-card>
            </router-link>
          </nav>
        </q-page-sticky>
        
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";

import FormatCurrency from "../../plugins/FormatCurrency";
import PageHeader from "../../layouts/PageHeader.vue";
import ResourceCards from "../ResourceCards.vue";
import MemberHeader from "../../components/MemberHeader.vue";
import { useCurrencySettings } from "../../composables/currencySettings";
import { useStore } from "vuex";

const props = defineProps<{
  code: string
}>();

const store = useStore();
const currencySettings = useCurrencySettings(props.code);

const showBalances = computed(() => 
  currencySettings.value?.attributes.defaultHideBalance !== true
  || store.getters.isAdmin
);

const query = ref("");


</script>
