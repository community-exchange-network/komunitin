<template>
  <account-header
    :account="account"
    :address="address"
    class="transfer-account-item"
  >
    <template #extra v-if="group">
      <q-item-section>
        <q-item-label lines="2" class="text-right text-caption text-onsurface-d">
          {{ group.attributes.name }}
        </q-item-label>
      </q-item-section>
      <q-item-section side style="padding-left: 8px;">
        <avatar
          size="md"
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
<style scoped lang="scss">
.transfer-account-item {
  margin: 0 -16px;
  border-radius: $generic-border-radius;
}
</style>