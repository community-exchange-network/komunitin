<template>
  <page-header :title="$t('home')" />
  <q-page-container>
    <q-page>
      <resource-cards
        :code="code"
        :module-name="['offers', 'needs']"
        include="category,member,member.group,member.group.currency,member.account"
        sort="-updated"
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

const store = useStore();

const myMember = computed(() => store.getters.myMember)
const code = computed(() => myMember?.value.group.attributes.code)

</script>
