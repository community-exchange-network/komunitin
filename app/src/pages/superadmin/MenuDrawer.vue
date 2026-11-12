<template>
  <div class="q-pa-md">
    <img
      src="~@/assets/logo.svg"
      alt="Komunitin"
      style="width:100%"
    >
  </div>
  <q-separator />
  <div class="text-label-medium-uppercase text-on-surface-low q-pl-md q-pt-md">
    {{ $t('administration') }}
  </div>
  <menu-item
    icon="supervisor_account"
    title="Manage Groups"
    to="/superadmin/groups"
  />
  <menu-item
    icon="sync_alt"
    title="Migrations"
    to="/superadmin/migrations"
  />
</template>
<script setup lang="ts">
import MenuItem from "../../components/MenuItem.vue"

</script>
