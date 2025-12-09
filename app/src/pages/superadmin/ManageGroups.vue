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
        :binary-state-sort="true"
        :pagination="{
          sortBy: 'status',
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
            <template v-if="props.row.status !== 'pending'">
              <q-btn
                icon="settings"
                color="icon-dark"
                flat
                round
                @click="settings(props.row)"
              />
              <q-btn
                icon="manage_accounts"
                color="icon-dark"
                flat
                round
                :to="`/groups/${props.row.code}/admin/accounts`"
              />
              <q-btn
                icon="list_alt"
                color="icon-dark"
                flat
                round
                :to="`/groups/${props.row.code}/admin/transactions`"
              />
              <q-btn
                icon="insert_chart"
                color="icon-dark"
                flat
                round
                :to="`/groups/${props.row.code}/stats`"
              />
            </template>
            <template v-else>
              <confirm-btn
                icon="check_circle"
                color="green"
                btn-color="icon-dark"
                flat
                round
                label="Activate Group"
                @confirm="activateGroup(props.row.code)"
              >
                Are you sure you want to activate group {{props.row.name}}?
              </confirm-btn>
              <delete-btn
                color="icon-dark"
                @confirm="deleteGroup(props.row.code)"
              >
                Are you sure you want to delete group {{props.row.name}}?
              </delete-btn>
            </template>
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
import DeleteBtn from '../../components/DeleteBtn.vue';
import ConfirmBtn from '../../components/ConfirmBtn.vue';
import { useQuasar } from 'quasar';

const compareStatus = (a: string, b: string) => {
  const order = {
    'pending': 0,
    'active': 1,
    'disabled': 2,
  }
  return (order[a] ?? 99) - (order[b] ?? 99)
}

const columns = [
  { name: 'code', label: 'Code', field: 'code', align: "left", sortable: true, classes: 'text-overline text-uppercase' },
  { name: 'name', label: 'Name', field: 'name', align: "left", sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: "left", sortable: true, sort: compareStatus },
  { name: 'created', label: 'Created', field: 'created', align: "left", sortable: true },
  { name: 'members', label: 'Members', field: 'members', align: "left", sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: "left", sortable: false },
]

const statusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'green'
    case 'disabled':
      return 'red'
    case 'pending':
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

const quasar = useQuasar()

const activateGroup = async (code: string) => {
  quasar.loading.show({
    message: 'Activating group...'
  })
  try {
    await store.dispatch('groups/update', {
      group: code,
      resource: {
        attributes: {
          status: 'active'
        }
      }
    })
    await loadGroups()
    quasar.notify({
      type: 'positive',
      message: 'Group activated successfully'
    })
  } finally {
    quasar.loading.hide()
  }
}
const deleteGroup = async (code: string) => {
  await store.dispatch('groups/delete', {
    group: code
  })
  await loadGroups()
}

</script>
