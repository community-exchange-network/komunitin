<template>
  <page-header
      search
      :title="$t('home')"
      balance
      @search="query = $event"
    />
  <q-page-container>
    <q-page v-if="code">
      <resource-cards
        :code="code"
        :type="['offers', 'needs']"
        include="category,member,member.group,member.group.currency,member.account"
        sort="-updated"
        :filter="{ status: 'published', expired: 'false' }"
        :query="query"
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


const store = useStore();
const query = ref("");

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
