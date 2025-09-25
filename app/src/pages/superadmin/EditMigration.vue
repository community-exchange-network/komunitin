<template>
  <page-header title="Migrations" back="/superadmin/migrations" />
  <q-page-container>
    <q-page class="q-pa-md">
      <div class="text-overline text-uppercase q-mb-lg">
        Edit migration
      </div>
      <migration-form
        v-model="migration"
        @submit="submitMigration"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import MigrationForm from './MigrationForm.vue'
import PageHeader from '../../layouts/PageHeader.vue'; 
import { useMigration } from './migrations'
import { useRouter } from 'vue-router';

const props = defineProps<{
  id: string
}>()

const router = useRouter()

const { migration, update } = useMigration(() => props.id)

const submitMigration = async () => {
  if (!migration.value) {
    return
  }

  await update(migration.value)

  // Navigate to the details page of the newly created migration
  router.push({ name: 'MigrationDetails', params: { id: migration.value.id } })
}

</script>

