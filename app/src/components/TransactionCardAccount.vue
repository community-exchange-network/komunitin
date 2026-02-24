<template>
  <account-header
    class="q-pl-none"
    :account="account"
    :address="address"
  >
    <template #extra v-if="group">
      <q-item-section>
        <q-item-label lines="1" class="text-right text-onsurface-m">
          {{ group.attributes.name }}
        </q-item-label>
        <q-item-label lines="1" caption class="text-right">
          {{ group.attributes.code }}
        </q-item-label>
      </q-item-section>
      <q-item-section avatar>
        <avatar
          :img-src="group.attributes.image"
          :text="group.attributes.code"
        />
      </q-item-section>
    </template>    
  </account-header>
</template>
<script setup lang="ts">
import AccountHeader from './AccountHeader.vue';
import Avatar from './Avatar.vue';
import type { Account, Group } from 'src/store/model';

defineProps<{
  account?: Account,
  address?: string,
  group?: Group
}>()

</script>