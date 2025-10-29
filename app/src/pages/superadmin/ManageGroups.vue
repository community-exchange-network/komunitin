<template>
  <page-header title="Groups" />
  <q-page-container>
    <q-page class="q-pa-md">
      <div class="text-overline text-uppercase">
        List of groups
      </div>

      <q-table
        :rows="rows" :columns="columns" :loading="loading"
        row-key="id" flat
        class="full-width text-onsurface"
        :pagination="{
          sortBy: 'code',
          rowsPerPage: 20,
        }"
      >
        <!-- Status column template -->
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-chip
              :color="statusColor(props.row.status)" 
              text-color="white" 
              :label="props.row.status"
              size="sm"
            />
          </q-td>
        </template>
        <!-- Actions column template -->
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              icon="edit"
              color="icon-dark"
              flat
              round
              @click="edit(props.row)"
            />
            <q-btn
              icon="settings"
              color="icon-dark"
              flat
              round
              @click="settings(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import type { Group } from '../../store/model';
import { useRouter } from 'vue-router';

import PageHeader from '../../layouts/PageHeader.vue';

const columns = [
  { name: 'code', label: 'Code', field: 'code', sortable: true, style: 'width: 100px; font-family: monospace; font-weight: bold;' },
  { name: 'name', label: 'Name', field: 'name', sortable: true },
  { name: 'status', label: 'Status', field: 'status', sortable: true },
  { name: 'created', label: 'Created', field: 'created', sortable: true },
  { name: 'members', label: 'Members', field: 'members', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', sortable: false },
]

const statusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'green'
    case 'disabled':
      return 'red'
    case 'new':
      return 'blue'
    default:
      return 'grey'
  }
}

const store = useStore()
const groups = computed(() => store.getters['groups/currentList'])

interface Row {
  id: string;
  code: string;
  name: string;
  status: string;
  created: string;
  members: number|string;
}

const rows = computed<Row[]>(() => groups.value.map((g: Group) => ({
  id: g.id,
  code: g.attributes.code,
  name: g.attributes.name,
  status: g.attributes.status ?? "active",
  created: new Date(g.attributes.created).toLocaleDateString(),
  members: g.relationships.members.meta?.count ?? "",
})))

const loading = ref(false)
const loadGroups = async () => {
  try {
    loading.value = true
    await store.dispatch('groups/loadList', {
      filter: {
        status: ["pending", "active", "disabled"]
      }
    })
    loading.value = false
    while (store.getters['groups/hasNext']) {
      await store.dispatch('groups/loadNext', {})
    }
  } finally {
    loading.value = false
  }
}

const router = useRouter()

const settings = (row: Row) => {
  router.push(`/groups/${row.code}/admin/settings`)
}
const edit = (row: Row) => {
  router.push(`/groups/${row.code}/admin/edit`)
}

// initialize
loadGroups()

</script>
