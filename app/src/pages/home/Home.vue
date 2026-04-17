<template>
  <page-header
      search
      :title="$t('home')"
      balance
      @search="query = $event"
    />
  <q-page-container>
    <q-page>
      <resource-cards
        :code="code"
        :type="['offers', 'needs']"
        include="category,member,member.group,member.group.currency,member.account,member.contacts"
        sort="-updated"
        :query="query"
      />
      <floating-btn-menu 
        :actions="actions" 
        color="primary"
        text-color="white"
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

const myMember = computed(() => store.getters.myMember)
const code = computed(() => myMember?.value.group.attributes.code)

const { t } = useI18n()
const actions = computed<FABAction[]>(() => [{
  label: t('createNeed'),
  icon: 'sym_r_loyalty',
  color: 'kred',
  to: `/groups/${code.value}/needs/new`
}, {
  label: t('createOffer'),
  icon: 'sym_r_local_offer',
  color: 'kblue',
  to: `/groups/${code.value}/offers/new`
}])

</script>

<style lang="scss" scoped>
.my-down-shadow {
  /* box-shadow: [X-offset] [Y-offset] [Blur] [Spread] [Color] */
  /* 1. X-offset: 0 (keeps it centered) */
  /* 2. Y-offset: 20px (pushes it down) */
  /* 3. Blur: 25px (softens the edge) */
  /* 4. Spread: -10px (hides it from the top/sides) */
  /* 5. Color: rgba(226, 232, 240, 0.5) (Slate-200 at 50% opacity) */
  
  box-shadow: 0 20px 25px -10px rgba(226, 232, 240, 0.5) !important;
  
  /* Optional: Add a second layer for more 'XL' depth */
  /* box-shadow: 0 20px 25px -10px rgba(226, 232, 240, 0.5), 
                0 8px 10px -6px rgba(226, 232, 240, 0.3) !important; */
}
</style>
