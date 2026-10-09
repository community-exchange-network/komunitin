<template>
  <page-header title="Migrations" />
  <q-page-container>
    <q-page class="q-pa-md">
      <q-banner v-if="error" class="bg-negative text-white q-mb-md">{{ error }}</q-banner>
        
      <div class="row items-center justify-between q-mb-md">
        <div class="text-overline text-uppercase">
          List of migrations
        </div>
        <q-btn icon="refresh" label="Refresh" flat :loading="loading" @click="refresh" />
        <q-btn 
          icon="add" 
          label="New Migration" 
          unelevated
          color="primary" 
          @click="createMigration"
        />
      </div>

      <q-table
        :rows="migrations" :columns="columns" :loading="loading"
        row-key="id" flat
        class="full-width text-onsurface"
        @row-click="onRowClick"
      >
        <!-- Status column template -->
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-chip
              :color="getStatusColor(props.value)" 
              text-color="white" 
              :label="getStatusLabel(props.value)"
              size="sm"
            />
          </q-td>
        </template>

        <!-- Empty state -->
        <template #no-data>
          <div class="full-width row flex-center text-grey q-gutter-sm">
            <q-icon size="2em" name="inbox" />
            <span>Nothing here... Yet!</span>
          </div>
        </template>
      </q-table>
      
    </q-page>
  </q-page-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../../layouts/PageHeader.vue'
import { useMigrations, getStatusColor, getStatusLabel, type Migration } from './migrations'

const router = useRouter()

const columns = computed(() => [
  { name: 'code', label: 'Community', align: 'left' as const, field: 'code', sortable: true, format: (value: string | null) => value ?? 'Not yet identified' },
  { name: 'id', label: 'Migration', align: 'left' as const, field: 'id' },
  { name: 'created', label: 'Created', align: 'left' as const, field: 'created', sortable: true, format: (val: string) => new Date(val).toLocaleDateString() },
  { name: 'updated', label: 'Updated', align: 'left' as const, field: 'updated', sortable: true, format: (val: string) => new Date(val).toLocaleDateString() },
  { name: 'status', label: 'Status', align: 'center' as const, field: 'status', sortable: true }
])

const { migrations, loading, error, refresh } = useMigrations()

const onRowClick = (evt: Event, row: Migration) => {
  router.push(`/superadmin/migrations/${row.id}`)
}

const createMigration = () => {
  router.push('/superadmin/migrations/new')
}
</script>
