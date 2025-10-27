<template>
  <page-header
    :title="$t('manageAccounts')"   
  >
    <template #buttons>
      <q-btn
        flat
        round
        icon="download"
        :title="$t('downloadCSV')"
        @click="download"
      />
    </template>
  </page-header>
  <q-page-container class="row justify-start">
    <q-page 
      padding 
      class="q-pa-lg"
    > 
      <div class="text-onsurface-m">
        {{ $t('manageAccountsText') }}
      </div>

      <div class="text-overline text-uppercase text-onsurface-m q-pt-lg q-pb-sm">
        {{ $t('accountRequests') }}
      </div>
      <div v-if="!loadingPending && pending.length === 0" class="text-onsurface-m q-mt-md">
        {{ $t('noAccountRequests') }}
      </div>
      <q-list
        v-if="!loadingPending && pending.length > 0"
      >
        <member-header
          v-for="member in pending"
          :key="member.id"
          :member="member"
          clickable
          @click="memberClick(member)"
        >
          <template #extra>
            <q-item-section class="text-onsurface-m">
              {{ $formatDate(member.attributes.created) }}
            </q-item-section>
          </template>
          <template #side>
            <div 
              class="row q-gutter-md"
              @click.stop
            >
              <q-btn
                color="primary"
                flat
                icon="how_to_reg"
                :label="$t('accept')"
                :loading="loadingAcceptMember"
                @click.stop="acceptMember(member)"
              />
              <delete-member-btn
                flat
                :label="$t('delete')"
                :member="member"
                @delete="loadPending"
              />
            </div>
          </template>
        </member-header>
      </q-list>



      <div class="text-overline text-uppercase text-onsurface-m q-pt-lg q-pb-sm">
        {{ $t('accounts') }}
      </div>
      <q-table
        ref="tableRef"
        v-model:pagination="pagination"
        :filter="filter"
        class="full-width text-onsurface"
        :columns="columns"
        :rows="members"
        :visible-columns="visibleColumns"
        :rows-per-page-options="[2,10,25,50,100,200]"
        :loading="loading"
        :fullscreen="isFullscreen"
        flat
        :binary-state-sort="true"
        @request="load"
        @row-click="(_, row) => memberClick(row)"
      >
        <template #top>
          <div class="full-width row justify-between items-center">
            <q-input
              v-model="filter"
              debounce="300"
              :placeholder="$t('search')"
              outlined
              dense
              style="min-width: 200px"
            >
              <template #append>
                <q-icon name="search" />
              </template>
            </q-input>
            <div class="row q-gutter-x-md">
              <q-select
                v-model="visibleColumns"
                multiple
                :options="visibleColumnsOptions"
                emit-value
                map-options
                option-value="name"
                :display-value="$t('columns')"
                outlined
                dense
                options-cover
                style="min-width: 200px"
              >
                <template #option="scope">
                  <q-item
                    v-bind="scope.itemProps"
                    clickable
                  >
                    <q-item-section>
                      <q-item-label>
                        {{ scope.opt.label }}
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-icon
                        v-if="scope.selected"
                        name="check"
                        color="primary"
                      />
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
              <q-btn
                flat
                dense
                round
                :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'"
                @click="isFullscreen = !isFullscreen"
              />
            </div>
          </div>
        </template>
        <template #pagination="scope">
          <q-btn
            icon="chevron_left"
            flat
            dense
            round
            :disable="scope.isFirstPage"
            @click="scope.prevPage"
          />
          <q-btn
            icon="chevron_right"
            flat
            dense
            round
            :disable="!hasNext"
            @click="scope.nextPage"
          />
        </template>
        <template #body-cell-image="scope">
          <q-td 
            :props="scope"
            style="padding-right: 0;"
          >
            <avatar
              :img-src="scope.row.attributes.image"
              :text="scope.row.attributes.name"
              size="40px"
            />
          </q-td>
        </template>
        <template #body-cell-state="scope">
          <q-td 
            :props="scope"
          >
            <member-status-chip 
              :status="scope.row.attributes.state" 
              size="sm"
            />
          </q-td>
        </template>
        <template #body-cell-actions="scope">
          <q-td 
            :props="scope"
            @click.stop
          >
            <q-btn
              class="q-mr-sm"
              flat
              dense
              round
              color="icon-dark"
              icon="edit"
              :to="`/groups/${scope.row.group.attributes.code}/admin/members/${scope.row.attributes.code}/profile`" 
            />
            <q-btn
              flat
              dense
              round
              color="icon-dark"
              icon="settings"
              :to="`/groups/${scope.row.group.attributes.code}/admin/members/${scope.row.attributes.code}/settings`"
            />
          </q-td>
        </template>
      </q-table>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { QTable } from 'quasar';
import PageHeader from 'src/layouts/PageHeader.vue';
import Avatar from 'src/components/Avatar.vue';
import MemberHeader from 'src/components/MemberHeader.vue';
import DeleteMemberBtn from 'src/pages/settings/DeleteMemberBtn.vue';
import MemberStatusChip from '../../components/MemberStatusChip.vue';
import type { Account, AccountSettings, CurrencySettings, Group, Member } from 'src/store/model';
import type { LoadListPayload } from 'src/store/resources';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'vuex';
import formatCurrency from 'src/plugins/FormatCurrency';
import { useRouter } from 'vue-router';
import { useAccountsCsv } from '../../composables/downloadCsv';

const props = defineProps<{
  code: string
}>()

const { t } = useI18n()
const store = useStore()

// Load group and currency.
store.dispatch('currencies/load', {
  id: props.code,
  include: 'settings'
})
store.dispatch('groups/load', {
  id: props.code,
  include: 'settings'
})

const currency = computed(() => store.getters['currencies/current'])
const currencySettings = computed(() => currency.value?.settings)
//const group = computed(() => store.getters['groups/current'])

const formatAmount = (amount: number) => amount === undefined ? "" : formatCurrency(amount, currency.value)

// Load account requests.
const pending = ref<(Member & {group: Group})[]>([])
const loadingPending = ref(true)
const loadPending = async () => {
  await store.dispatch('members/loadList', {
    group: props.code,
    filter: {
      state: "pending"
    }
  })
  pending.value = store.getters['members/currentList']
  loadingPending.value = false
}
const loadPendingPromise = loadPending()

// Load accounts.
type ExtendedMember = Member & { account: Account & { settings: AccountSettings }}

const settingsKeys = [
  'allowPayments',
  'allowPaymentRequests',
  'allowSimplePayments',
  'allowSimplePaymentRequests',
  'allowQrPayments',
  'allowQrPaymentRequests',
  'allowMultiplePayments',
  'allowMultiplePaymentRequests',
  'allowTagPayments',
  'allowTagPaymentRequests',
  'acceptPaymentsAutomatically',
  'enableAcceptPaymentsAfter2w',
  'allowExternalPayments',
  'allowExternalPaymentRequests',
  'acceptExternalPaymentsAutomatically',
  'onPaymentCreditLimit',
  'nfcTags'
]

const columns = [
  {name: 'image', field: (m: ExtendedMember) => m.attributes.image, label: '', align: 'center', required: true},
  {name: 'code', field: (m: ExtendedMember) => m.account.attributes.code, label: t('account'), align: 'left', required: true, sortable: true},  
  {name: 'name', field: (m: ExtendedMember) => m.attributes.name, label: t('name'), align: 'left', required: true, sortable: true},
  {name: 'state', field: (m: ExtendedMember) => m.attributes.state, label: t('state'), align: 'left'},
  {name: 'balance', field: (m: ExtendedMember) => m.account.attributes.balance, label: t('balance'), align: 'right', sortable: true, format: formatAmount},
  // Account limits
  {name: 'creditLimit', field: (m: ExtendedMember) => m.account.attributes.creditLimit, label: t('creditLimit'), align: 'right', sortable: true, format: formatAmount},
  {name: 'maximumBalance', field: (m: ExtendedMember) => m.account.attributes.maximumBalance, label: t('maximumBalance'), align: 'right', sortable: true, format: formatAmount},
  // Account settings
  ...settingsKeys.map(key => {
    const settingsField = (key: string) => {
      if (key === 'enableAcceptPaymentsAfter2w') {
        return (m: ExtendedMember) => m.account.settings.attributes.acceptPaymentsAfter !== undefined 
          ? (!!m.account.settings.attributes.acceptPaymentsAfter) : undefined
      } else if (key === 'nfcTags') {
        return (m: ExtendedMember) => m.account.settings.attributes.tags?.length
      } else {
        return (m: ExtendedMember) => m.account.settings.attributes[key as keyof AccountSettings["attributes"]]
      }
    }
    const settingsValue = (key: string, value: number|boolean|undefined, currencySettings: CurrencySettings) => {
      if (value === undefined) {
        const defaultKey = "default" + key.charAt(0).toUpperCase() + key.slice(1) as keyof CurrencySettings["attributes"]
        return currencySettings.attributes[defaultKey] ?? false
      }
      return value
    }
    const settingsFormat = (key: string) => {
      if (key === "onPaymentCreditLimit") {
        return (a: number | undefined) => formatAmount(settingsValue(key, a, currencySettings.value) as number)
      } else if (key === "nfcTags") {
        return undefined
      } else {
        // This is a special boolean. If set to true or false, we'll set a checkmark or a cross.
        // If undefined, we'll set a greyed checkmark or cross depending on the default value.
        return (a: boolean | undefined) => settingsValue(key, a, currencySettings.value) ? "\u2714" : "\u2718"
      }
    }
    const settingsClasses = (key: string) => {
      if (!["nfcTags"].includes(key)) {
        return (m: ExtendedMember) =>  {
          const setting = m.account.settings.attributes[key as keyof AccountSettings["attributes"]]
          if (setting === undefined) {
            return 'text-onsurface-d'
          } else if (typeof setting === 'boolean') {
            return setting ? 'text-positive' : 'text-negative'
          } else {
            return 'text-onsurface'
          }
        }
      }
      return undefined
    }
      
    return {
      name: key,
      field: settingsField(key),
      label: t(key),
      align: 'center',
      format: settingsFormat(key),
      classes: settingsClasses(key)
    }
  }),
  {name: 'actions', label: '', align: 'right', required: true}
]

const visibleColumnsOptions = columns.filter(c => !('required' in c) || !c.required)
const visibleColumns = ref(['state', 'balance', 'creditLimit', 'maximumBalance'])
const isFullscreen = ref(false)

type Pagination = {
  sortBy: string
  descending: boolean
  page: number
  rowsPerPage: number
  rowsNumber?: number
}

const pagination = ref({
  sortBy: 'code',
  descending: false,
  page: 1,
  rowsPerPage: 2,
  rowsNumber: undefined
})

const filter = ref('')

const loading = ref(true)
//const accounts = ref([])
const members = ref([])
const hasNext = ref(false)

const load = async (scope: {pagination: Pagination, filter?: string}) => {  
  loading.value = true
  // Wait for the pending requests to be loaded, since otherwise the store
  // could mess up the two concurrent requests.
  await loadPendingPromise

  const { rowsPerPage, sortBy, descending, page } = scope.pagination
  const sortField = sortBy ?? "code"
  // If the sortBy is null, don't explicitly sort (we'll implicitly sort by code)
  const sort = sortBy ? (descending ? "-" : "") + sortField : undefined
  const group = props.code
  const pageSize = rowsPerPage
  
  try {
    // Since data is splitted in two APIs, we need to call first the one that sorts the data.
    const socialFields = ['name']
    if (socialFields.includes(sortField) || scope.filter) {
      if (page === 1) {
        await store.dispatch('members/loadList', {
          group,
          filter: {
            state: ["active", "disabled", "suspended"]
          },
          sort,
          search: scope.filter ? scope.filter : undefined,
          pageSize
        } as LoadListPayload)
      } else if (page === pagination.value.page + 1) {
        // Next page
        await store.dispatch('members/loadNext', {})
      } else if (page === pagination.value.page - 1) {
        // Previous page
        await store.dispatch('members/loadPrev', {})
      } else {
        throw new Error("Invalid page")
      }
      hasNext.value = store.getters['members/hasNext']
      const loadedMembers = store.getters['members/page'](page - 1)
      // Load accounts related to fetched members
      await store.dispatch('accounts/loadList', {
        group,
        filter: {
          id: loadedMembers.map((member: Member) => member.relationships.account.data.id),
          status: ["active", "disabled", "suspended"]
        },
        pageSize,
        include: 'settings',
      })
      members.value = loadedMembers
      
    } else {
      if (page === 1) {
        await store.dispatch('accounts/loadList', {
          group,
          sort,
          filter: {
            status: ["active", "disabled", "suspended"]
          },
          include: 'settings',
          pageSize
        } as LoadListPayload)
      } else if (page === pagination.value.page + 1) {
        // Next page
        await store.dispatch('accounts/loadNext', {})
      } else if (page === pagination.value.page - 1) {
        // Previous page
        await store.dispatch('accounts/loadPrev', {})
      } else {
        throw new Error("Invalid page")
      }
      hasNext.value = store.getters['accounts/hasNext']
      // Load members related to fetched accounts
      const loadedAccounts = store.getters['accounts/page'](page - 1)
      await store.dispatch("members/loadList", {
        group: props.code,
        filter: {
          account: loadedAccounts.map((account: Account) => account.id),
          state: ["active", "disabled", "suspended"]
        },
        pageSize,
      })
      const loadedMembers = store.getters['members/currentList']
      // Build a lookup map from account ID to member for efficient access
      const memberByAccountId = new Map(
        loadedMembers.map((m: Member) => [m.relationships.account.data.id, m])
      );
      members.value = loadedAccounts.map((account: Account) => {
        return memberByAccountId.get(account.id);
      }).filter(Boolean)

    }

    // The server does not provide total number of items, so we just set it to N+1 if
    // hasNext is true, where N is the number of loaded items.
    const rowsNumber = (page - 1) * rowsPerPage + members.value.length + (hasNext.value ? 1 : 0) 
    
    // Update the pagination object
    pagination.value = {
      ...pagination.value,
      sortBy,
      descending,
      page,
      rowsPerPage,
      rowsNumber
    }
  } finally {
    loading.value = false
  }
}

const tableRef = ref<QTable>()

onMounted(() => {
  tableRef.value?.requestServerInteraction()
})

const router = useRouter()
const memberClick = (member: Member) => {
  router.push({name: 'Member', params: {
    code: (member as Member & {group: Group}).group.attributes.code,
    memberCode: member.attributes.code
  }})
}

const loadingAcceptMember = ref(false)
const acceptMember = async (member: Member & {group: Group}) => {
  try {
    loadingAcceptMember.value = true
    await store.dispatch('members/update', {
      id: member.id,
      group: member.group.attributes.code,
      resource: {
        type: "members",
        attributes: {
          state: "active"
        }
      }
    })
    await loadPending()
    tableRef.value?.requestServerInteraction()
  } finally {
    loadingAcceptMember.value = false
  }
}

const {download} = useAccountsCsv({
  code: props.code
})


</script>