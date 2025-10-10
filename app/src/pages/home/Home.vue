<template>
  <page-header :title="$t('home')" />
  <q-page-container>
    <q-page>
      <resource-cards
        :code="code"
        :module-name="['offers', 'needs']"
      />
      <slot name="after" />
    </q-page>
  </q-page-container>
</template>

<script lang="ts" setup>
import PageHeader from '../../layouts/PageHeader.vue';
import ResourceCards from '../ResourceCards.vue';
import { useStore } from 'vuex';
import { computed } from 'vue';

const store = useStore();

const myMember = computed(() => store.getters.myMember)
const code = computed(() => myMember?.value.group.attributes.code)

</script>
