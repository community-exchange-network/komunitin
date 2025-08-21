<template>
  <page-header title="Migrations" back="/superadmin/migrations" />
  <q-page-container>
    <q-page class="q-pa-md">
      <div class="text-overline text-uppercase q-mb-lg">
        Start a migration
      </div>
      <migration-form
        v-model="migration"
        @submit="submitMigration"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import MigrationForm from './MigrationForm.vue'
import PageHeader from '../../layouts/PageHeader.vue'; 
import { useMigrations, type Migration } from './migrations'
import { useRouter } from 'vue-router';

const migration = ref<Partial<Migration>>()
const router = useRouter()

const { create } = useMigrations({immediate: false})

const submitMigration = async () => {
  if (!migration.value) {
    return
  }

  const migrationId = await create(migration.value)

  // Navigate to the details page of the newly created migration
  router.push({ name: 'MigrationDetails', params: { id: migrationId } })
}

</script>

