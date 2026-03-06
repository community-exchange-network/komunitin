<template>
  <div class="q-pa-md">
    <img
      src="~assets/logo.svg"
      alt="Komunitin"
      style="width:100%"
    >
  </div>
  <q-separator />
  <div class="text-overline text-onsurface-d q-pl-md q-pt-md text-uppercase">
    {{ $t('administration') }}
  </div>
  <menu-item
    icon="sym_r_supervisor_account"
    title="Manage Groups"
    to="/superadmin/groups"
  />
  <menu-item
    icon="sym_r_sync_alt"
    title="Migrations"
    to="/superadmin/migrations"
  />
</template>
<script setup lang="ts">
import MenuItem from "../../components/MenuItem.vue"

</script>