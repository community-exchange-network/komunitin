<template>
  <page-header :title="$t('home')" />
  <q-page-container>
    <q-page>
      <resource-cards
        :code="code"
        module-name="offers"
        prop-name="offer"
        :card="card"
        include="category,member,member.group,member.group.currency,member.account"
      />
      <slot name="after" />
    </q-page>
  </q-page-container>
</template>

<script lang="ts" setup>
import { useStore } from 'vuex';
import { computed } from 'vue';
import PageHeader from '../../layouts/PageHeader.vue';
import ResourceCards from '../ResourceCards.vue';
import OfferCard from "../../components/OfferCard.vue";


const store = useStore();

const myMember = computed(() => store.getters.myMember)
const code = computed(() => myMember?.value.group.attributes.code)

const card = OfferCard.name;

</script>
