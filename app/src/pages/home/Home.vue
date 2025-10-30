<template>
  <page-header
      search
      :title="$t('home')"
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
      <slot name="after" />
    </q-page>
  </q-page-container>
</template>

<script lang="ts" setup>
import { useStore } from 'vuex';
import { computed, ref } from 'vue';
import PageHeader from '../../layouts/PageHeader.vue';
import ResourceCards from '../ResourceCards.vue';

const store = useStore();
const query = ref("");

const myMember = computed(() => store.getters.myMember)
const code = computed(() => myMember?.value.group.attributes.code)

</script>
