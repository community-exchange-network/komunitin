<template>
  <page-header title="Migrations" back="/" />
  <q-page-container>
    <q-page class="q-pa-md">
      <div class="row justify-left items-center q-mb-md">
        <q-input
          v-model="baseUrl"
          label="Accounting URL"
          outlined
          class="q-mb-md col-6"
        />
        <q-btn
          icon="refresh"
          color="icon-dark"
          flat
          round
          @click="refresh"
          class="q-ml-sm"
        />
      </div>
        
      <div class="row items-center justify-between q-mb-md">
        <div class="text-overline text-uppercase">
          List of migrations
        </div>
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
        <!-- State column template -->
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

        <!-- Actions column template -->
        <template #body-cell-actions="props">
          <q-td :props="props">
            <delete-btn 
              color="icon-dark"
              :loading="deletingIds.includes(props.row.id)"
              @confirm="() => confirmDelete(props.row)"
              @click.stop.prevent
            >
              Are you sure you want to delete migration {{ props.row.code }}?
            </delete-btn>
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
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import PageHeader from "../../layouts/PageHeader.vue"
import DeleteBtn from "../../components/DeleteBtn.vue"
import { useMigrations, getStatusColor, getStatusLabel, type Migration } from './migrations';

// Composables
const router = useRouter()
const q = useQuasar()

// Reactive data
const deletingIds = ref<string[]>([])

// Table columns definition
const columns = computed(() => [
  { name: 'code', label: 'Code', align: 'left' as const, field: 'code', sortable: true, style: 'width: 100px; font-family: monospace; font-weight: bold;' },
  { name: 'name', label: 'Name', align: 'left' as const, field: 'name', sortable: true },
  { name: 'created', label: 'Created', align: 'left' as const, field: 'created', sortable: true, format: (val: string) => new Date(val).toLocaleDateString() },
  { name: 'updated', label: 'Updated', align: 'left' as const, field: 'updated', sortable: true, format: (val: string) => new Date(val).toLocaleDateString() },
  { name: 'status', label: 'Status', align: 'center' as const, field: 'status', sortable: true },
  { name: 'actions', label: 'Actions', align: 'center' as const, field: 'actions', sortable: false, style: 'width: 80px;' }
])

const {baseUrl, migrations, loading, refresh} = useMigrations()

// TODO: Remove that after development
baseUrl.value = "http://localhost:2025"

// Methods

const onRowClick = (evt: Event, row: Migration) => {
  router.push(`/admin/migrations/${row.id}`)
}

const createMigration = () => {
  router.push('/admin/migrations/new')
}

const confirmDelete = async (migration: Migration) => {
  deletingIds.value.push(migration.id)

  try {
    const response = await fetch(`${baseUrl.value}/migrations/${migration.id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      throw new Error('Failed to delete migration')
    }

    // Remove from local list
    migrations.value = migrations.value.filter(m => m.id !== migration.id)
    q.notify({ 
      type: 'positive', 
      message: 'Migration deleted successfully', 
      position: 'top' 
    })
  } finally {
    deletingIds.value = deletingIds.value.filter(id => id !== migration.id)
  }
}


</script>